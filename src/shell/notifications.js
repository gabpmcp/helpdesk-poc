/**
 * Handles side-effects based on events
 * Part of the imperative shell
 */
import { v4 as generateUUID } from 'uuid';
import jwt from 'jsonwebtoken';
import { Result, tryCatchAsync, deepFreeze, pipe } from '../utils/functional.js';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = '1h';  // 1 hour
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

/**
 * @typedef {Object} AuthResult
 * @property {boolean} isAuthenticated
 * @property {string} [userId]
 * @property {Object} [userDetails]
 * @property {string} [reason]
 */

/**
 * @typedef {(email: string, password: string) => Promise<Result<{userId: string, userDetails: Object}, Error>>} AuthenticateFn
 */

/**
 * @typedef {(ticket: Object) => Promise<Result<Object, Error>>} TicketOperationFn
 */

/**
 * @typedef {(comment: Object) => Promise<Result<Object, Error>>} CommentOperationFn
 */

/**
 * @typedef {Object} NotificationDeps
 * @property {AuthenticateFn} authenticate - Function to authenticate users
 * @property {Function} storeEvent - Function to store events
 * @property {TicketOperationFn} createTicket - Function to create tickets
 * @property {TicketOperationFn} updateTicket - Function to update tickets
 * @property {CommentOperationFn} addComment - Function to add comments
 * @property {TicketOperationFn} escalateTicket - Function to escalate tickets
 */

/**
 * Notifies external systems based on event type
 * This is where all side effects happen
 * Returns a Result with the processed event or an error
 * @param {Object} event - Event to process
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
export const notifyExternal = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    // Process the event based on its type
    switch (event.type) {
      case 'LOGIN_REQUESTED':
        return handleLoginRequested(event, deps);
        
      case 'LOGIN_SUCCEEDED':
        return handleLoginSucceeded(event, deps);
        
      case 'REFRESH_TOKEN_VALIDATED':
        return handleRefreshTokenValidated(event, deps);
        
      case 'TICKET_CREATED':
        return handleTicketCreated(event, deps);
        
      case 'TICKET_UPDATED':
        return handleTicketUpdated(event, deps);
        
      case 'COMMENT_ADDED':
        return handleCommentAdded(event, deps);
        
      case 'TICKET_ESCALATED':
        return handleTicketEscalated(event, deps);
        
      default:
        // For events that don't require external notification, return as is
        return deepFreeze(event);
    }
  })();
};

/**
 * Handles login request events
 * Validates credentials and generates appropriate response event
 * @param {Object} event - Login request event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleLoginRequested = async (event, deps) => {
  // Use pipe para crear un pipeline funcional de procesamiento
  const processLogin = pipe(
    // Paso 1: Verificar credenciales
    async () => {
      console.log('Verifying credentials for:', event.email);
      return await verifyCredentials(event.email, event.password, deps.authenticate);
    },
    
    // Paso 2: Crear el evento apropiado basado en el resultado de autenticación
    async (authResult) => {
      console.log('Authentication result:', authResult);
      
      if (!authResult.isAuthenticated) {
        // Crear evento LOGIN_FAILED (patrón inmutable)
        const loginFailedEvent = deepFreeze({
          type: 'LOGIN_FAILED',
          userId: event.userId,
          email: event.email,
          reason: authResult.reason || 'Invalid credentials',
          timestamp: event.timestamp
        });
        
        console.log('Login failed, storing event');
        // Almacenar el evento de fallo de inicio de sesión
        const storeResult = await deps.storeEvent(loginFailedEvent);
        
        if (!storeResult.isOk) {
          console.error('Failed to store LOGIN_FAILED event:', storeResult.unwrapError());
          return Result.error('Failed to store LOGIN_FAILED event');
        }
        
        return Result.ok(loginFailedEvent);
      }
      
      // Crear evento LOGIN_SUCCEEDED (patrón inmutable)
      const loginSucceededEvent = deepFreeze({
        type: 'LOGIN_SUCCEEDED',
        userId: event.userId,
        email: event.email,
        zohoUserId: authResult.userId,
        timestamp: event.timestamp
      });
      
      console.log('Login succeeded, storing event');
      // Almacenar el evento de inicio de sesión exitoso
      const storeResult = await deps.storeEvent(loginSucceededEvent);
      
      if (!storeResult.isOk) {
        console.error('Failed to store LOGIN_SUCCEEDED event:', storeResult.unwrapError());
        return Result.error('Failed to store LOGIN_SUCCEEDED event');
      }
      
      return Result.ok(loginSucceededEvent);
    },
    
    // Paso 3: Generar tokens para eventos de inicio de sesión exitosos
    async (eventResult) => {
      if (!eventResult.isOk) {
        return eventResult;
      }
      
      const loginEvent = eventResult.unwrap();
      
      if (loginEvent.type === 'LOGIN_SUCCEEDED') {
        console.log('Generating tokens for successful login');
        return await handleLoginSucceeded(loginEvent, deps);
      }
      
      return eventResult;
    }
  );
  
  // Ejecutar el pipeline y manejar errores
  const result = await tryCatchAsync(async () => {
    return await processLogin();
  })();
  
  if (!result.isOk) {
    console.error('Login process failed:', result.unwrapError());
    
    // Crear evento LOGIN_FAILED con información de error (patrón inmutable)
    const loginFailedEvent = deepFreeze({
      type: 'LOGIN_FAILED',
      userId: event.userId,
      email: event.email,
      reason: 'Authentication service unavailable',
      error: result.unwrapError().message || 'Unknown error',
      timestamp: event.timestamp
    });
    
    // Intentar almacenar el evento de fallo
    try {
      await deps.storeEvent(loginFailedEvent);
    } catch (error) {
      console.error('Failed to store error event:', error);
    }
    
    return Result.ok(loginFailedEvent);
  }
  
  return result;
};

/**
 * Verifies user credentials
 * Returns authentication result with user ID if successful
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {AuthenticateFn} authenticate - Function to authenticate users
 * @returns {Promise<AuthResult>} - Authentication result
 */
const verifyCredentials = async (email, password, authenticate) => {
  // Use the authenticate function from dependencies
  const authResult = await authenticate(email, password);
  
  if (authResult.isOk) {
    const userData = authResult.unwrap();
    return {
      isAuthenticated: true,
      userId: userData.userId,
      userDetails: userData.userDetails
    };
  }
  
  // Authentication failed
  const error = authResult.unwrapError();
  return {
    isAuthenticated: false,
    reason: error.message || 'Invalid credentials'
  };
};

/**
 * Handles successful login events
 * Generates access and refresh tokens using JWT
 * @param {Object} event - Login succeeded event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleLoginSucceeded = async (event, deps) => {
  // Generate secure JWT tokens
  const accessToken = generateAccessToken(event.userId);
  const refreshToken = generateRefreshToken(event.userId);
  
  // Create a new event with tokens (immutable pattern)
  const enrichedEvent = deepFreeze({
    ...event,
    accessToken,
    refreshToken
  });
  
  try {
    // Store refresh token for later validation
    // This is a side effect, but isolated in this function
    const tokenEvent = deepFreeze({
      type: 'REFRESH_TOKEN_STORED',
      userId: event.userId,
      refreshToken,
      timestamp: event.timestamp
    });
    
    await deps.storeEvent(tokenEvent);
  } catch (error) {
    console.error('Failed to store refresh token:', error);
    // Continue even if token storage fails
  }
  
  return enrichedEvent;
};

/**
 * Handles refresh token validation
 * Verifies JWT signature and expiration, then generates new tokens
 * @param {Object} event - Refresh token validation event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleRefreshTokenValidated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    const { refreshToken, userId } = event;
    
    // Verify the refresh token
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      // Check if token is a refresh token
      if (decoded.type !== 'refresh') {
        // Create invalid token event
        const invalidTokenEvent = deepFreeze({
          type: 'INVALID_REFRESH_TOKEN',
          userId,
          reason: 'Token is not a refresh token',
          timestamp: new Date().toISOString()
        });
        
        await deps.storeEvent(invalidTokenEvent);
        return invalidTokenEvent;
      }
      
      // Check if token belongs to the user
      if (decoded.userId !== userId) {
        // Create invalid token event
        const invalidTokenEvent = deepFreeze({
          type: 'INVALID_REFRESH_TOKEN',
          userId,
          reason: 'Token does not belong to user',
          timestamp: new Date().toISOString()
        });
        
        await deps.storeEvent(invalidTokenEvent);
        return invalidTokenEvent;
      }
      
      // Generate new tokens
      const accessToken = generateAccessToken(userId);
      const newRefreshToken = generateRefreshToken(userId);
      
      // Create token refreshed event
      const tokenRefreshedEvent = deepFreeze({
        type: 'TOKEN_REFRESHED',
        userId,
        accessToken,
        refreshToken: newRefreshToken,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(tokenRefreshedEvent);
      return tokenRefreshedEvent;
      
    } catch (error) {
      // Token verification failed
      const invalidTokenEvent = deepFreeze({
        type: 'INVALID_REFRESH_TOKEN',
        userId,
        reason: error.message || 'Invalid token',
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(invalidTokenEvent);
      return invalidTokenEvent;
    }
  })();
};

/**
 * Generates a JWT access token
 * Pure function with no side effects
 * @param {string} userId - User ID to include in the token
 * @returns {string} - JWT access token
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generates a JWT refresh token
 * Pure function with no side effects
 * @param {string} userId - User ID to include in the token
 * @returns {string} - JWT refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

/**
 * Handles ticket creation
 * @param {Object} event - Ticket creation event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleTicketCreated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Creating ticket in external system:', event.ticketDetails);
    
    // Create the ticket in the external system
    const createResult = await deps.createTicket({
      ...event.ticketDetails,
      userId: event.userId
    });
    
    if (!createResult.isOk) {
      console.error('Failed to create ticket:', createResult.unwrapError());
      
      // Create ticket creation failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_CREATION_FAILED',
        userId: event.userId,
        ticketDetails: event.ticketDetails,
        error: createResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Get the created ticket details
    const createdTicket = createResult.unwrap();
    
    // Create ticket created success event
    const successEvent = deepFreeze({
      ...event,
      externalTicketId: createdTicket.id,
      status: 'created'
    });
    
    return successEvent;
  })();
};

/**
 * Handles ticket updates
 * @param {Object} event - Ticket update event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleTicketUpdated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Updating ticket in external system:', event.ticketId);
    
    // Update the ticket in the external system
    const updateResult = await deps.updateTicket({
      id: event.externalTicketId || event.ticketId,
      ...event.updateDetails,
      userId: event.userId
    });
    
    if (!updateResult.isOk) {
      console.error('Failed to update ticket:', updateResult.unwrapError());
      
      // Create ticket update failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_UPDATE_FAILED',
        userId: event.userId,
        ticketId: event.ticketId,
        externalTicketId: event.externalTicketId,
        updateDetails: event.updateDetails,
        error: updateResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Create ticket updated success event
    const successEvent = deepFreeze({
      ...event,
      status: 'updated'
    });
    
    return successEvent;
  })();
};

/**
 * Handles adding comments to tickets
 * @param {Object} event - Comment added event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleCommentAdded = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Adding comment to ticket in external system:', event.ticketId);
    
    // Add the comment in the external system
    const commentResult = await deps.addComment({
      ticketId: event.externalTicketId || event.ticketId,
      comment: event.comment,
      userId: event.userId
    });
    
    if (!commentResult.isOk) {
      console.error('Failed to add comment:', commentResult.unwrapError());
      
      // Create comment failed event
      const failedEvent = deepFreeze({
        type: 'COMMENT_FAILED',
        userId: event.userId,
        ticketId: event.ticketId,
        externalTicketId: event.externalTicketId,
        comment: event.comment,
        error: commentResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Create comment added success event
    const successEvent = deepFreeze({
      ...event,
      externalCommentId: commentResult.unwrap().id,
      status: 'added'
    });
    
    return successEvent;
  })();
};

/**
 * Handles ticket escalation
 * @param {Object} event - Ticket escalation event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleTicketEscalated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Escalating ticket in external system:', event.ticketId);
    
    // Escalate the ticket in the external system
    const escalateResult = await deps.escalateTicket({
      id: event.externalTicketId || event.ticketId,
      escalationLevel: event.escalationLevel,
      reason: event.reason,
      userId: event.userId
    });
    
    if (!escalateResult.isOk) {
      console.error('Failed to escalate ticket:', escalateResult.unwrapError());
      
      // Create escalation failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_ESCALATION_FAILED',
        userId: event.userId,
        ticketId: event.ticketId,
        externalTicketId: event.externalTicketId,
        escalationLevel: event.escalationLevel,
        reason: event.reason,
        error: escalateResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Create escalation success event
    const successEvent = deepFreeze({
      ...event,
      status: 'escalated'
    });
    
    return successEvent;
  })();
};
