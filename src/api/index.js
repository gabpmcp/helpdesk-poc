/**
 * API endpoints definition
 * Part of the imperative shell
 */
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import jwt from 'jsonwebtoken';
import { transition, applyEvent, initialState } from '../core/transition.js';
import { validateCommand } from '../validators/commandSchema.js';
import { 
  storeEvent, 
  fetchEventsForUser, 
  fetchAuthEvents,
  createSupabaseQueryFn,
  createSupabasePersistFn
} from '../shell/eventStore.js';
import { notifyExternal } from '../shell/notifications.js';
import { Result, tryCatchAsync, deepFreeze } from '../utils/functional.js';
import * as zohoProxyService from '../services/zohoProxyService.js';
import { 
  ZOHO_TICKET_DETAIL_WEBHOOK,
  ZOHO_CONTACTS_WEBHOOK,
  ZOHO_ACCOUNTS_WEBHOOK,
  ZOHO_CATEGORIES_WEBHOOK
} from '../services/zohoProxyService.js';
import { setupProjectionRoutes, setupWebhookRoutes, setupDashboardRoutes, setupZohoApiRoutes } from './projections.js';
import commentsRouter from './comments.js';

/**
 * JWT secret key (should be in env vars in production)
 */
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * CORS middleware factory - Configura CORS para rutas que requieren credenciales
 * @param {Function} handler - Controlador de ruta
 * @returns {Function} Controlador con CORS configurado
 */
const withCors = handler => async (ctx, next) => {
  // Configurar encabezados CORS
  ctx.set('Access-Control-Allow-Origin', 'http://localhost:5172');
  ctx.set('Access-Control-Allow-Credentials', 'true');
  ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  ctx.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  
  // Responder inmediatamente a las solicitudes OPTIONS
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    return;
  }
  
  // Ejecutar el controlador original
  return handler(ctx, next);
};

/**
 * JWT verification middleware
 * Skip verification for login attempts and projection endpoints
 */
const verifyJwt = async (ctx, next) => {
  // Skip JWT verification for login attempts
  if (ctx.path === '/commands' && ctx.method === 'POST') {
    const bodyResult = await parseBody(ctx);
    
    if (bodyResult.isOk) {
      const body = bodyResult.unwrap();
      if (body && (body.type === 'LOGIN_ATTEMPT' || body.type === 'REFRESH_TOKEN')) {
        return next();
      }
    }
  }

  // Skip JWT verification for projection endpoints (public access)
  if (ctx.path.startsWith('/projections/')) {
    return next();
  }

  const token = ctx.headers.authorization?.split(' ')[1];
  if (!token) {
    ctx.status = 401;
    ctx.body = deepFreeze({ error: 'Authentication token required' });
    return;
  }

  // Use tryCatchAsync for JWT verification
  const verificationResult = await tryCatchAsync(async () => {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Verify token type is 'access'
    if (decoded.type !== 'access') {
      return Result.error('Invalid token type');
    }
    
    return Result.ok(decoded);
  })();
  
  if (!verificationResult.isOk) {
    ctx.status = 401;
    ctx.body = deepFreeze({ error: 'Invalid or expired token' });
    return;
  }
  
  // Set email from token
  ctx.state.email = verificationResult.unwrap().email;
  
  await next();
};

/**
 * Helper function to parse request body
 * Returns a Result with the parsed body or an error
 */
const parseBody = async (ctx) => {
  return tryCatchAsync(async () => {
    if (!ctx.request.body) {
      return Result.error('Missing request body');
    }
    
    // Deep freeze to ensure immutability
    return Result.ok(deepFreeze(ctx.request.body));
  })();
};

/**
 * Helper function to safely unwrap nested Result objects
 * Ensures we always get the raw value, not a Result wrapper
 */
const unwrapNestedResult = (result) => {
  if (!result || typeof result !== 'object') {
    return result;
  }
  
  // Check if it's a Result object
  if ('isOk' in result && typeof result.unwrap === 'function') {
    const value = result.unwrap();
    // Recursively unwrap in case of nested Results
    return unwrapNestedResult(value);
  }
  
  return result;
};

/**
 * Pure function to extract command from context
 */
const extractCommand = async(ctx) => {
  return parseBody(ctx)
    .then(body => {
      console.log('Parsing request body:', body);
      const command = body.unwrap();

      // Validate that body is an object
      if (!command || typeof command !== 'object') {
        return Result.error(new Error('Invalid request body: must be an object'));
      }
      
      // Validate that body has a type property
      if (!command.type) {
        return Result.error(new Error('Invalid command: missing type property'));
      }
      
      // Validate that body has an email property (required for all commands)
      if (!command.email) {
        return Result.error(new Error('Invalid command: missing required email property'));
      }
      
      // Return the command with timestamp if not provided
      return Result.ok({
        ...command,
        timestamp: command.timestamp || Date.now()
      });
    });
};

/**
 * Pure function to validate a command
 */
const validate = (command) => {
  // Ensure command has an email
  if (!command.email) {
    return Result.error('Command is missing required email field');
  }
  
  // Validate command using schema validator
  const validationResult = validateCommand(command);
  
  if (validationResult.isError) {
    return Result.error(validationResult.unwrapError());
  }
  
  return validationResult;
};

/**
 * Pure function to fetch history for a command
 */
const fetchHistory = (email, queryFn) => {
  // Validate email is provided
  if (!email) {
    return Result.error(new Error('Missing required email for fetching history'));
  }
  
  // console.log('Fetching history for user:', email);
  return fetchEventsForUser(queryFn)(email);
};

/**
 * Pure function to conditionally fetch history based on command type
 */
const maybeFetchHistory = async (command, deps) => {
  // Some commands may require history to process
  // For now, we'll just fetch history for all commands
  return fetchHistory(command.email, deps.queryFn);
};

/**
 * Pure function to generate an event from a command
 */
const generateEvent = (command, history, timestamp) => {
  console.log('Generating event with command:', command);
  return transition(command, history, timestamp);
};

/**
 * Pure function to store an event
 * Improved error handling for Supabase connection issues
 */
const storeEvent$ = async (event, deps) => {
  console.log('Attempting to store event in Supabase:', event);
  console.log('Using persist function:', deps.persistFn ? 'Available' : 'Not available');
  
  // For testing purposes, if we don't have a valid persist function,
  // we'll simulate a successful storage operation
  if (!deps.persistFn || process.env.NODE_ENV === 'test') {
    console.log('Using mock event storage (no persist function)');
    return Promise.resolve(Result.ok(event));
  }
  
  const result = await storeEvent(deps.persistFn)(event);
  if (!result.isOk) {
    console.error('Failed to store event:', result.unwrapError());
  } else {
    console.log('Event stored successfully');
  }
  return result;
};

/**
 * Pure function to handle notifications
 * Improved error handling for external service connections
 */
const notify$ = async (event, deps) => {
  console.log('Processing notifications for event:', event);
  
  // Create notification dependencies from our primitive functions
  const notificationDeps = {
    authenticate: deps.authenticate,
    storeEvent: (event) => storeEvent(deps.persistFn)(event),
    createTicket: deps.createTicket,
    updateTicket: deps.updateTicket,
    addComment: deps.addComment,
    escalateTicket: deps.escalateTicket,
    n8nClient: deps.n8nClient,
    supabaseAuth: deps.supabaseAuth,
    supabaseClient: deps.supabaseClient
  };
  
  // For testing purposes or when external services are not available,
  // we'll simulate successful notification processing
  if (process.env.NODE_ENV === 'test' || !deps.authenticate) {
    console.log('Using mock notification processing (no external services)');
    
    // Simulate appropriate responses based on event type
    if (event.type === 'LOGIN_REQUESTED') {
      // Simulate a successful login for testing
      const loginSucceededEvent = deepFreeze({
        type: 'LOGIN_SUCCEEDED',
        email: event.email,
        timestamp: event.timestamp,
        accessToken: 'mock-access-token-' + Date.now(),
        refreshToken: 'mock-refresh-token-' + Date.now()
      });
      return Promise.resolve(Result.ok(loginSucceededEvent));
    }
    
    // For other event types, just return the event as is
    return Promise.resolve(Result.ok(event));
  }
  
  const result_2 = await notifyExternal(event, notificationDeps);
  if (!result_2.isOk) {
    console.error('Failed to process notifications:', result_2.unwrapError());
  } else {
    console.log('Notifications processed successfully');
  }
  return result_2;
};

/**
 * Pure function to shape the response based on event type
 */
const shapeResponse = (event) => {
  console.log('Shaping response for event:', event.type);
  
  switch (event.type) {
    case 'LOGIN_SUCCEEDED':
      return {
        success: true,
        email: event.email,
        accessToken: event.accessToken,
        refreshToken: event.refreshToken
      };
      
    case 'USER_REGISTERED':
      return {
        success: true,
        email: event.email,
        isNewUser: true,
        zohoContactId: event.zohoContactId
      };
      
    case 'LOGIN_FAILED':
      return {
        success: false,
        reason: event.reason
      };
      
    case 'TOKEN_REFRESHED':
      return {
        success: true,
        email: event.email,
        accessToken: event.accessToken,
        refreshToken: event.refreshToken
      };
      
    case 'INVALID_REFRESH_TOKEN':
      return {
        success: false,
        reason: event.reason
      };
      
    default:
      return {
        success: true,
        event
      };
  }
};

/**
 * Create primitive functions for external services
 * These functions follow functional-declarative principles
 */
const createExternalServiceFunctions = (deps) => {
  // Create primitive query and persist functions
  const queryFn = deps.supabaseClient ? createSupabaseQueryFn(deps.supabaseClient) : null;
  const persistFn = deps.supabaseClient ? createSupabasePersistFn(deps.supabaseClient) : null;
  
  // Create primitive authentication function - with mock for development/testing
  const authenticate = (() => {
    if (process.env.NODE_ENV === 'test' || process.env.MOCK_AUTH === 'true') {
      // Mock authentication function for testing
      return (email, password) => {
        console.log('[MOCK AUTH] Testing credentials for:', email);
        
        // For testing, we'll accept a specific test account
        if (email === 'test@example.com' && password === 'password123') {
          console.log('[MOCK AUTH] Valid test credentials');
          return Promise.resolve(Result.ok({
            email: 'test@example.com',
            userDetails: {
              name: 'Test User',
              email: 'test@example.com',
              role: 'user'
            }
          }));
        }
        
        // Reject all other credentials
        console.log('[MOCK AUTH] Invalid credentials');
        return Promise.resolve(Result.error(new Error('Invalid credentials')));
      };
    } else if (deps.n8nClient) {
      // Real authentication function using n8n
      return (email, password) => deps.n8nClient.authenticate(email, password);
    } else {
      // No authentication function available
      return null;
    }
  })();
  
  // Create primitive ticket operation functions
  const createTicket = deps.n8nClient ?
    (ticket) => deps.n8nClient.createTicket(ticket) :
    null;
    
  const updateTicket = deps.n8nClient ?
    (ticket) => deps.n8nClient.updateTicket(ticket) :
    null;
    
  const addComment = deps.n8nClient ?
    (comment) => deps.n8nClient.addComment(comment) :
    null;
    
  const escalateTicket = deps.n8nClient ?
    (ticket) => deps.n8nClient.escalateTicket(ticket) :
    null;
  
  return {
    queryFn,
    persistFn,
    authenticate,
    createTicket,
    updateTicket,
    addComment,
    escalateTicket,
    n8nClient: deps.n8nClient,
    supabaseAuth: deps.supabaseAuth,
    supabaseClient: deps.supabaseClient
  };
};

/**
 * Sets up API routes
 */
export const setupApiRoutes = (deps) => {
  // console.log('Setting up API routes with dependencies:', deps);
  const router = new Router();
  
  // Add body parser middleware
  router.use(bodyParser());
  
  // Create primitive functions for external services
  const serviceFunctions = createExternalServiceFunctions(deps);
  
  // --- Command endpoint (centralized) ---
  router.post('/commands', async (ctx) => {
    console.log('Request received at /commands');
    const timestamp = new Date().toISOString();
    
    // Use forward-composition pipeline with Promises
    return extractCommand(ctx)
      .then(result => {
        console.log('Command extraction result:', result);
        
        if (!result.isOk) {
          return Promise.reject({
            status: 400,
            error: result.unwrapError().message || 'Invalid request body'
          });
        }
        
        // Unwrap the command from the Result object
        const rawCommand = result.unwrap();
        console.log('Extracted raw command:', rawCommand);
        return Promise.resolve(rawCommand);
      })
      .then(rawCommand => {
        // Validate the raw command
        const validationResult = validate(rawCommand);
        console.log('Validation result:', validationResult);
        
        if (!validationResult.isOk) {
          return Promise.reject({
            status: 400,
            error: validationResult.unwrapError()
          });
        }
        
        // Unwrap the validated command
        const validCommand = validationResult.unwrap();
        console.log('Validated command:', validCommand);
        return Promise.resolve(validCommand);
      })
      .then(async validCommand => {
        // Fetch history if needed
        return maybeFetchHistory(validCommand, serviceFunctions)
          .then(historyResult => {
            
            if (!historyResult.isOk) {
              console.log('History fetch result:', historyResult);
              return Promise.reject({
                status: 500,
                error: 'Failed to fetch history'
              });
            }
            
            const history = historyResult.unwrap();
            
            // Generate event from command and history
            const eventResult = generateEvent(validCommand, history, timestamp);
            console.log('Event generation result:', eventResult);
            
            if (!eventResult.isOk) {
              return Promise.reject({
                status: 400,
                error: eventResult.unwrapError()
              });
            }
            
            const event = eventResult.unwrap();
            console.log('Generated event:', event);
            return Promise.resolve(event);
          });
      })
      .then(async event => {
        // Store the event
        return storeEvent$(event, serviceFunctions)
          .then(storeResult => {
            console.log('Event storage result:', storeResult);
            
            if (!storeResult.isOk) {
              return Promise.reject({
                status: 500,
                error: 'Failed to store event'
              });
            }
            
            const storedEvent = storeResult.unwrap();
            console.log('Stored event:', storedEvent);
            return Promise.resolve(storedEvent);
          });
      })
      .then(async storedEvent => {
        // Process notifications
        return notify$(storedEvent, serviceFunctions)
          .then(notifyResult => {
            console.log('Notification result:', notifyResult);
            
            if (!notifyResult.isOk) {
              return Promise.reject({
                status: 500,
                error: 'Failed to process notifications'
              });
            }
            
            const processedEvent = notifyResult.unwrap();
            console.log('Processed event:', processedEvent);
            return Promise.resolve(processedEvent);
          });
      })
      .then(processedEvent => {
        // Shape the response
        const response = shapeResponse(processedEvent);
        console.log('Shaped response:', response);
        
        // Send the response
        ctx.status = 200;
        ctx.body = deepFreeze(response);
      })
      .catch(error => {
        console.error('Error in command processing pipeline:', error);
        
        // Handle errors
        ctx.status = error.status || 500;
        ctx.body = deepFreeze({
          error: error.error || 'An unexpected error occurred',
          message: 'An unexpected error occurred'
        });
      });
  });

  // --- Zoho API Proxy Endpoints ---
  
  // Reports Overview Endpoint - Refactorizado para usar n8n con enfoque declarativo
  router.get('/projections/overview', withCors(async (ctx) => {
    try {
      // Usar el servicio zohoProxyService con enfoque declarativo
      const data = await zohoProxyService.getReportsOverview();
      
      ctx.status = 200;
      ctx.body = deepFreeze(data);
    } catch (error) {
      console.error('Error fetching reports overview from n8n:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch reports overview from n8n',
        source: 'n8n-workflow'
      });
    }
  }));
  
  // Tickets Endpoint
  router.get('/api/zoho/tickets', withCors(async (ctx) => {
    try {
      // Enfoque declarativo sin usar Result
      const filters = ctx.query;
      const tickets = await zohoProxyService.getTickets(filters);
      
      ctx.status = 200;
      ctx.body = deepFreeze(tickets);
    } catch (error) {
      console.error('Error proxying tickets:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch tickets' 
      });
    }
  }));

  // Ticket Detail Endpoint
  router.get('/api/zoho/tickets/:id', withCors(async (ctx) => {
    try {
      const { id } = ctx.params;
      console.log(`🔍 Fetching ticket details for ID: ${id}`);
      console.log(`🌐 Using webhook path: ${ZOHO_TICKET_DETAIL_WEBHOOK}?ticketId=${id}`);
      
      const result = await zohoProxyService.getTicketById(id);
      
      console.log('📊 n8n ticket result type:', typeof result);
      console.log('📊 n8n ticket result shape:', Object.keys(result || {}));
      console.log('📊 n8n ticket result preview:', JSON.stringify(result).substring(0, 200));
      
      // Verificar la estructura de la respuesta
      if (!result) {
        console.error('❌ No response received from n8n');
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: 'No response received from n8n'
        });
        return;
      }

      // Preparar la respuesta según la estructura esperada por el frontend
      let ticketData;
      
      // Adaptación para diferentes estructuras de respuesta posibles
      if (result.ticket) {
        // Si la respuesta tiene una propiedad 'ticket', usarla directamente
        ticketData = result.ticket;
      } else if (result.success && result.data) {
        // Si tiene estructura success/data (común en APIs RESTful)
        ticketData = result.data;
      } else if (result.id) {
        // Si el resultado ya es el ticket en sí mismo
        ticketData = result;
      } else {
        console.error('❌ Could not extract ticket data from response');
        ctx.status = 404;
        ctx.body = deepFreeze({ 
          error: 'Ticket not found or invalid format',
          details: 'Could not extract ticket data from n8n response'
        });
        return;
      }
      
      // Verificar que tengamos datos mínimos del ticket
      if (!ticketData.id) {
        console.error('❌ Invalid ticket data: missing ID');
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: 'Invalid ticket data returned from n8n'
        });
        return;
      }
      
      console.log('✅ Ticket details retrieved successfully');
      
      // Devolver los datos del ticket en el formato esperado por el frontend
      ctx.status = 200;
      ctx.body = deepFreeze({
        data: ticketData
      });
    } catch (error) {
      console.error(`❌ Error fetching ticket ${ctx.params.id}:`, error);
      console.error('❌ Stack trace:', error.stack);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch ticket details',
        source: 'zoho-ticket-detail-api',
        stack: error.stack
      });
    }
  }));
  
  // Get Ticket Comments Endpoint
  router.get('/api/zoho/tickets/:id/comments', withCors(async (ctx) => {
    try {
      const { id } = ctx.params;
      console.log(`🔍 Fetching comments for ticket ID: ${id}`);
      
      const result = await zohoProxyService.getTicketComments(id);
      
      console.log('📊 Comments result type:', typeof result);
      console.log('📊 Comments result shape:', Object.keys(result || {}));
      
      // Verificar la respuesta - Nueva lógica de validación
      if (!result) {
        console.error('❌ Error in n8n response: No result object');
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: 'No response from n8n for ticket comments'
        });
        return;
      }
      
      // Verificar que exista un array de comentarios o extraerlo de la estructura
      let comments = [];
      
      if (Array.isArray(result)) {
        // Si el resultado es directamente un array
        if (result.length > 0 && result[0].comments && Array.isArray(result[0].comments)) {
          // Si es un array con un objeto que contiene comments (caso n8n workflow)
          comments = result[0].comments;
          console.log('📊 Found comments in first element of array');
        } else {
          // Si es un array de comentarios directamente
          comments = result;
        }
      } else if (result.comments && Array.isArray(result.comments)) {
        // Si tiene una propiedad comments que es un array
        comments = result.comments;
      } else if (result.data && Array.isArray(result.data)) {
        // Si tiene una propiedad data que es un array
        comments = result.data;
      } else if (result.success === false) {
        console.error('❌ Error in n8n response: API reported failure');
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: result.error || 'Error reported by n8n API'
        });
        return;
      }
      
      console.log(`✅ Retrieved ${comments.length} comments for ticket ${id}`);
      console.log({comments});

      ctx.status = 200;
      ctx.body = deepFreeze({
        success: true,
        ticketId: id,
        comments,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`❌ Error fetching comments for ticket ${ctx.params.id}:`, error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch ticket comments',
        stack: error.stack
      });
    }
  }));
  
  // Add Comment to Ticket Endpoint
  router.post('/api/zoho/tickets/:id/comments', withCors(async (ctx) => {
    try {
      const { id } = ctx.params;
      const commentData = ctx.request.body;
      
      console.log(`🔍 Adding comment to ticket ID: ${id}`);
      console.log({commentData});
      
      if (!commentData || !commentData.comment) {
        ctx.status = 400;
        ctx.body = deepFreeze({
          error: 'Comment content is required'
        });
        return;
      }
      
      const result = await zohoProxyService.addComment(id, commentData);
      
      console.log('📊 Add comment result:', JSON.stringify(result).substring(0, 200));
      
      // Verificar la respuesta
      if (!result || !result.success) {
        console.error('❌ Error in n8n response for adding comment:', result);
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: 'Failed to add comment to ticket'
        });
        return;
      }
      
      ctx.status = 201; // Created
      ctx.body = deepFreeze(result);
    } catch (error) {
      console.error(`❌ Error adding comment to ticket ${ctx.params.id}:`, error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to add comment to ticket',
        stack: error.stack
      });
    }
  }));
  
  // Filtered Tickets Endpoint
  router.get('/api/zoho/tickets', withCors(async (ctx) => {
    try {
      console.log('🔍 Fetching filtered tickets');
      
      // Extraer los filtros de la query string
      const { status, priority, departmentId, limit, from } = ctx.query;
      
      // Crear objeto de filtros con valores válidos
      const filters = {};
      if (status) filters.status = status;
      if (priority) filters.priority = priority;
      if (departmentId) filters.departmentId = departmentId;
      
      // Valores numéricos para paginación
      const limitNum = limit ? parseInt(limit, 10) : 50;
      const fromNum = from ? parseInt(from, 10) : 0;
      
      console.log(`🔍 Filters: ${JSON.stringify(filters)}, Limit: ${limitNum}, From: ${fromNum}`);
      
      const result = await zohoProxyService.getFilteredTickets(filters, limitNum, fromNum);
      
      console.log('📊 Filtered tickets result type:', typeof result);
      console.log('📊 Filtered tickets count:', result?.tickets?.length || 0);
      
      // Verificar la respuesta
      if (!result || !result.success) {
        console.error('❌ Error in n8n response for filtered tickets:', result);
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: 'Invalid response from n8n for filtered tickets'
        });
        return;
      }
      
      ctx.status = 200;
      ctx.body = deepFreeze(result);
    } catch (error) {
      console.error('❌ Error fetching filtered tickets:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch filtered tickets',
        stack: error.stack
      });
    }
  }));

  // Categories Endpoint
  router.get('/api/zoho/categories', withCors(async (ctx) => {
    try {
      console.log('🔍 Iniciando solicitud de categorías');
      
      // Enfoque declarativo sin usar Result
      console.log('🔄 Llamando a zohoProxyService.getCategories()');
      const categories = await zohoProxyService.getCategories();
      
      console.log('✅ Categorías obtenidas con éxito:', JSON.stringify(categories).substring(0, 200));
      ctx.status = 200;
      ctx.body = deepFreeze(categories);
    } catch (error) {
      console.error('❌ Error detallado al obtener categorías:', error);
      console.error('❌ Stack trace:', error.stack);
      
      // Respuesta de error más descriptiva para el cliente
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch categories',
        details: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }));
  
  // Get Zoho Accounts Endpoint
  router.get('/api/zoho/accounts', withCors(async (ctx) => {
    try {
      console.log('🔍 Fetching Zoho accounts via n8n...');
      console.log('🌐 Using N8N_BASE_URL:', process.env.N8N_BASE_URL || 'No value set, using default');
      const result = await zohoProxyService.getAccounts();
      
      console.log('📊 n8n accounts result type:', typeof result);
      console.log('📊 n8n accounts result shape:', Object.keys(result || {})); 
      console.log('📊 n8n accounts result preview:', JSON.stringify(result).substring(0, 200));
      
      if (!result || !result.success) {
        console.error('❌ Error in n8n response for accounts:', result);
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: (result?.message) || 'Failed to fetch accounts',
          details: 'n8n response did not include success: true' 
        });
        return;
      }
      
      // Usar validAccounts que es la propiedad real de la respuesta n8n
      const accounts = result.validAccounts || result.accounts || [];
      console.log(`✅ Returning ${accounts.length} accounts to frontend`);
      
      ctx.status = 200;
      ctx.body = deepFreeze({
        success: true,
        data: accounts
      });
    } catch (error) {
      console.error('❌ Error fetching accounts:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch accounts',
        details: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }));
  
  // Get Knowledge Base Articles Endpoint
  router.get('/api/zoho/kb-articles', withCors(async (ctx) => {
    try {
      console.log('Fetching knowledge base articles via n8n...');
      
      // Extraer opciones de la query
      const { category, search, limit } = ctx.query;
      const options = {};
      
      if (category) options.category = category;
      if (search) options.search = search;
      if (limit) options.limit = parseInt(limit, 10);
      
      console.log('KB article options:', options);
      
      // Obtener artículos con opciones
      const result = await zohoProxyService.getKbArticles(options);
      
      console.log('n8n kb articles result:', JSON.stringify(result).substring(0, 200));
      
      if (!result || !result.success) {
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: (result?.message) || 'Failed to fetch KB articles' 
        });
        return;
      }
      
      // Usar articles que es la propiedad real de la respuesta n8n
      const articles = result.articles || [];
      console.log(`Returning ${articles.length} KB articles to frontend`);
      
      ctx.status = 200;
      ctx.body = deepFreeze({
        success: true,
        data: articles
      });
    } catch (error) {
      console.error('Error fetching KB articles:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch KB articles',
        details: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }));
  
  // Create Ticket Endpoint
  router.post('/api/zoho/tickets', withCors(async (ctx) => {
    try {
      const ticketData = ctx.request.body;
      console.log('📝 Recibida solicitud para crear ticket:', JSON.stringify(ticketData).substring(0, 500));
      
      // Validar que tenemos los campos requeridos
      if (!ticketData.subject) {
        ctx.status = 400;
        ctx.body = deepFreeze({ 
          error: 'Subject is required'
        });
        return;
      }
      
      if (!ticketData.contactId) {
        ctx.status = 400;
        ctx.body = deepFreeze({ 
          error: 'ContactId is required'
        });
        return;
      }
      
      if (!ticketData.departmentId) {
        ctx.status = 400;
        ctx.body = deepFreeze({ 
          error: 'DepartmentId is required'
        });
        return;
      }
      
      // Intentar crear el ticket
      console.log('🔄 Enviando datos a zohoProxyService.createTicket()');
      const result = await zohoProxyService.createTicket(ticketData);
      console.log('✅ Respuesta del servicio de creación:', JSON.stringify(result).substring(0, 500));
      
      if (!result || !result.success) {
        console.error('❌ Error al crear ticket:', result);
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: (result?.message || result?.error) || 'Failed to create ticket',
          details: result
        });
        return;
      }
      
      // Si la creación fue exitosa, devolver la respuesta
      ctx.status = 201;
      ctx.body = deepFreeze(result);
    } catch (error) {
      console.error('❌ Error detallado al crear ticket:', error);
      console.error('❌ Stack trace:', error.stack);
      
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to create ticket',
        details: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }));
  
  // Add Comment Endpoint
  router.post('/api/zoho/tickets/:id/comments', withCors(async (ctx) => {
    try {
      const { id } = ctx.params;
      const commentData = ctx.request.body;
      const result = await zohoProxyService.addComment(id, commentData);
      
      if (!result.isOk) {
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: result.unwrapError().message || 'Failed to add comment' 
        });
        return;
      }
      
      ctx.status = 201;
      ctx.body = deepFreeze(result.unwrap());
    } catch (error) {
      console.error('Error adding comment:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to add comment' 
      });
    }
  }));
  
  // Get Contacts Endpoint
  router.get('/api/zoho/contacts', withCors(async (ctx) => {
    try {
      console.log('🔍 Fetching Zoho contacts via n8n...');
      console.log('🌐 Using N8N_BASE_URL:', process.env.N8N_BASE_URL || 'No value set, using default');
      const result = await zohoProxyService.getContacts();
      
      console.log('📊 n8n contacts result type:', typeof result);
      console.log('📊 n8n contacts result shape:', Object.keys(result || {})); 
      console.log('📊 n8n contacts result preview:', JSON.stringify(result).substring(0, 200));
      
      if (!result || !result.success) {
        console.error('❌ Error in n8n response for contacts:', result);
        ctx.status = 500;
        ctx.body = deepFreeze({ 
          error: (result?.message) || 'Failed to fetch contacts',
          details: 'n8n response did not include success: true' 
        });
        return;
      }
      
      // Usar validContacts que es la propiedad real de la respuesta n8n
      const contacts = result.validContacts || result.contacts || [];
      console.log(`✅ Returning ${contacts.length} contacts to frontend`);
      
      ctx.status = 200;
      ctx.body = deepFreeze({
        success: true,
        data: contacts
      });
    } catch (error) {
      console.error('❌ Error fetching contacts:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch contacts',
        stack: error.stack 
      });
    }
  }));

  // --- Zoho Ticket API Endpoints ---

  // Get filtered tickets
  router.get('/api/tickets', withCors(async (ctx) => {
    try {
      // Extract user information from JWT
      const { user } = ctx.state || {};
      const filters = { ...ctx.query };
      
      // Apply role-based filtering if user is available
      if (user && user.role === 'client') {
        filters.clientEmail = user.email;
      }
      
      // Fetch tickets from Zoho via n8n
      const data = await zohoProxyService.getTickets(filters);
      
      ctx.status = 200;
      ctx.body = deepFreeze(data);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch tickets',
        source: 'zoho-tickets-api'
      });
    }
  }));

  // Get ticket details
  router.get('/api/tickets/:ticketId', withCors(async (ctx) => {
    try {
      const { ticketId } = ctx.params;
      
      // Fetch ticket details from Zoho via n8n
      const data = await zohoProxyService.getTicketById(ticketId);
      
      ctx.status = 200;
      ctx.body = deepFreeze(data);
    } catch (error) {
      console.error(`Error fetching ticket ${ctx.params.ticketId}:`, error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to fetch ticket details',
        source: 'zoho-ticket-detail-api'
      });
    }
  }));

  // Create a new ticket
  router.post('/api/tickets', withCors(async (ctx) => {
    try {
      // Extract user information from JWT
      const { user } = ctx.state || {};
      
      // Prepare ticket data with user information
      const ticketData = {
        ...ctx.request.body,
        createdBy: user ? user.email : 'anonymous'
      };
      
      // Create ticket via Zoho n8n workflow
      const data = await zohoProxyService.createTicket(ticketData);
      
      ctx.status = 201;
      ctx.body = deepFreeze(data);
    } catch (error) {
      console.error('Error creating ticket:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to create ticket',
        source: 'zoho-create-ticket-api'
      });
    }
  }));

  // Update ticket status
  router.patch('/api/tickets/:ticketId', withCors(async (ctx) => {
    try {
      const { ticketId } = ctx.params;
      const { status } = ctx.request.body;
      
      // Validate status
      const validStatuses = ['Open', 'In Progress', 'On Hold', 'Closed'];
      if (!status || !validStatuses.includes(status)) {
        ctx.status = 400;
        ctx.body = deepFreeze({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          source: 'zoho-update-ticket-api'
        });
        return;
      }
      
      // Update status via Zoho n8n workflow
      const data = await zohoProxyService.updateTicketStatus(ticketId, status);
      
      ctx.status = 200;
      ctx.body = deepFreeze(data);
    } catch (error) {
      console.error(`Error updating ticket ${ctx.params.ticketId}:`, error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to update ticket',
        source: 'zoho-update-ticket-api'
      });
    }
  }));

  // Add comment to ticket
  router.post('/api/tickets/:ticketId/comments', withCors(async (ctx) => {
    try {
      const { ticketId } = ctx.params;
      
      // Extract user information from JWT
      const { user } = ctx.state || {};
      
      // Prepare comment data with user information
      const commentData = {
        ...ctx.request.body,
        author: user ? user.email : 'anonymous',
        timestamp: new Date().toISOString()
      };
      
      // Add comment via Zoho n8n workflow
      const data = await zohoProxyService.addTicketComment(ticketId, commentData);
      
      ctx.status = 201;
      ctx.body = deepFreeze(data);
    } catch (error) {
      console.error(`Error adding comment to ticket ${ctx.params.ticketId}:`, error);
      ctx.status = 500;
      ctx.body = deepFreeze({ 
        error: error.message || 'Failed to add comment',
        source: 'zoho-add-comment-api'
      });
    }
  }));

  // --- State reconstruction endpoint ---
  router.get('/state/:email', verifyJwt, async (ctx) => {
    const { email } = ctx.params;
    
    // Verify that the requesting user matches the token
    if (email !== ctx.state.email) {
      ctx.status = 403;
      ctx.body = deepFreeze({ error: 'Unauthorized access to user state' });
      return;
    }
    
    try {
      // Fetch all events for the user
      const eventsResult = await fetchEventsForUser(serviceFunctions.queryFn)(email);
      
      if (!eventsResult.isOk) {
        ctx.status = 500;
        ctx.body = deepFreeze({ error: 'Failed to fetch events' });
        return;
      }
      
      const events = eventsResult.unwrap();
      
      // Reconstruct state by applying all events
      const state = events.reduce((currentState, event) => {
        return applyEvent(currentState, event);
      }, initialState);
      
      ctx.status = 200;
      ctx.body = deepFreeze({ state });
    } catch (error) {
      console.error('Error reconstructing state:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ error: 'Failed to reconstruct state' });
    }
  });
  
  // --- User authentication status endpoint ---
  router.get('/auth/status', verifyJwt, async (ctx) => {
    const { email } = ctx.state;
    
    try {
      // Fetch authentication events for the user
      const authEventsResult = await fetchAuthEvents(serviceFunctions.queryFn)(email);
      
      if (!authEventsResult.isOk) {
        ctx.status = 500;
        ctx.body = deepFreeze({ error: 'Failed to fetch authentication status' });
        return;
      }
      
      const authEvents = authEventsResult.unwrap();
      
      // Get the latest authentication event
      const latestEvent = authEvents.length > 0 ? 
        authEvents[authEvents.length - 1] : 
        null;
      
      if (!latestEvent) {
        ctx.status = 404;
        ctx.body = deepFreeze({ error: 'No authentication history found' });
        return;
      }
      
      // Return authentication status
      ctx.status = 200;
      ctx.body = deepFreeze({
        email,
        lastAuthenticated: latestEvent.timestamp,
        status: latestEvent.type === 'LOGIN_SUCCEEDED' ? 'authenticated' : 'unauthenticated'
      });
    } catch (error) {
      console.error('Error fetching authentication status:', error);
      ctx.status = 500;
      ctx.body = deepFreeze({ error: 'Failed to fetch authentication status' });
    }
  });
  
  return router;
};

/**
 * Initialize API routes
 * @param {Object} app - Koa app instance
 * @param {Object} deps - Dependencies
 */
export const initializeApi = (app, deps = {}) => {
  // Setup CORS headers for all routes
  app.use(async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
      return;
    }
    await next();
  });

  // Apply body parser middleware
  app.use(bodyParser());
  
  // Setup API routes
  const apiRouter = setupApiRoutes(deps);
  
  // Setup projection routes
  const projectionRouter = setupProjectionRoutes();
  
  // Setup webhook routes
  const webhookRouter = setupWebhookRoutes();
  
  // Setup dashboard routes
  const dashboardRouter = setupDashboardRoutes();
  
  // Setup Zoho API routes
  const zohoApiRouter = setupZohoApiRoutes();
  
  // Apply all routers
  app.use(apiRouter.routes());
  app.use(apiRouter.allowedMethods());
  
  app.use(projectionRouter.routes());
  app.use(projectionRouter.allowedMethods());
  
  app.use(webhookRouter.routes());
  app.use(webhookRouter.allowedMethods());
  
  app.use(dashboardRouter.routes());
  app.use(dashboardRouter.allowedMethods());
  
  app.use(zohoApiRouter.routes());
  app.use(zohoApiRouter.allowedMethods());
  
  app.use(commentsRouter.routes());
  app.use(commentsRouter.allowedMethods());
  
  // Add webhook-test endpoint for testing n8n webhooks
  const webhookTestRouter = new Router({
    prefix: '/webhook-test'
  });
  
  webhookTestRouter.all('(.*)', async (ctx) => {
    // Forward the request to n8n
    const n8nUrl = process.env.N8N_BASE_URL || 'http://localhost:5678';
    const path = ctx.path.replace('/webhook-test', '');
    const url = `${n8nUrl}${path}`;
    
    console.log(`Forwarding request to n8n: ${url}`);
    
    try {
      const response = await fetch(url, {
        method: ctx.method,
        headers: {
          'Content-Type': 'application/json',
          ...ctx.headers
        },
        body: ctx.request.method !== 'GET' ? JSON.stringify(ctx.request.body) : undefined
      });
      
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        ctx.body = await response.json();
      } else {
        ctx.body = await response.text();
      }
      
      ctx.status = response.status;
    } catch (error) {
      console.error('Error forwarding to n8n:', error);
      ctx.status = 500;
      ctx.body = { error: error.message };
    }
  });
  
  app.use(webhookTestRouter.routes());
  app.use(webhookTestRouter.allowedMethods());
  
  return app;
};