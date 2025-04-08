/**
 * Zoho Proxy Service - FCIS pattern compliant
 * Functional, Composable, Isolated, Stateless
 * 
 * This service proxies requests to Zoho API to avoid CORS issues
 */
import { deepFreeze, pipeAsync } from '../utils/functional.js';

// Zoho API configuration (should be in environment variables in production)
const ZOHO_BASE_URL = process.env.ZOHO_BASE_URL || 'https://desk.zoho.com';
const ZOHO_API_TOKEN = process.env.ZOHO_API_TOKEN || 'your-zoho-api-token';
const ZOHO_ORGANIZATION_ID = process.env.ZOHO_ORGANIZATION_ID || 'your-org-id';

// n8n configuration (should be in environment variables in production)
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n.advancio.io/webhook/';

// Los webhooks de n8n sin barras iniciales para evitar doble slash cuando se concatenan con N8N_BASE_URL
export const ZOHO_CATEGORIES_WEBHOOK = 'zoho-categories';
export const ZOHO_TICKETS_WEBHOOK = 'zoho-tickets';
export const ZOHO_TICKET_DETAIL_WEBHOOK = 'zoho-ticket-detail';
export const ZOHO_CREATE_TICKET_WEBHOOK = 'zoho-create-ticket';
export const ZOHO_UPDATE_TICKET_WEBHOOK = 'zoho-update-ticket';
export const ZOHO_ADD_COMMENT_WEBHOOK = 'zoho-add-comment';
export const ZOHO_CONTACTS_WEBHOOK = 'zoho-contacts';
export const ZOHO_ACCOUNTS_WEBHOOK = 'zoho-accounts';
export const ZOHO_GET_COMMENTS_WEBHOOK = 'zoho-get-comments';

// Helper para construir URLs correctamente con o sin slash final en la base URL
const buildN8nUrl = (basePath, endpoint) => {
  // Aseguramos que haya un slash entre la base y el endpoint
  if (basePath.endsWith('/')) {
    return `${basePath}${endpoint}`;
  }
  return `${basePath}/${endpoint}`;
};

// Debug helper para mostrar URLs n8n
console.log(' N8N URL base configurada:', N8N_BASE_URL);
console.log(' URL ejemplo para contactos:', buildN8nUrl(N8N_BASE_URL, ZOHO_CONTACTS_WEBHOOK));
console.log(' URL ejemplo para cuentas:', buildN8nUrl(N8N_BASE_URL, ZOHO_ACCOUNTS_WEBHOOK));

/**
 * Pure function to create headers for Zoho API requests
 * @returns {Object} - Headers object
 */
const createZohoHeaders = () => ({
  'Authorization': `Zoho-oauthtoken ${ZOHO_API_TOKEN}`,
  'orgId': ZOHO_ORGANIZATION_ID,
  'Content-Type': 'application/json',
});

/**
 * Pure function to normalize a path
 * @param {String} path - Path to normalize
 * @returns {String} - Normalized path
 */
const normalizePath = (path) => 
  path.startsWith('/') ? path : `/${path}`;

/**
 * Pure function to log a message
 * @param {String} message - Message to log
 * @returns {String} - The same message (for pipeline chaining)
 */
const logMessage = (message) => {
  console.log(message);
  return message;
};

/**
 * Pure function to fetch data from n8n webhook
 * @param {String} path - Path to n8n webhook
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Promise with data
 */
export const fetchFromN8N = (path, options = {}) => {
  const url = typeof path === 'string' && !path.startsWith('http') 
    ? buildN8nUrl(N8N_BASE_URL, path) 
    : path;
  
  console.log(`[n8n] Requesting: ${url}`);
  
  // Ensure content-type is set correctly for POST requests with a body
  if (options.method === 'POST' && options.body && !options.headers?.['Content-Type']) {
    options.headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    };
  }
  
  return pipeAsync(
    () => logMessage(`[n8n] Fetching data from n8n: ${url} with method ${options.method || 'GET'}`),
    () => {
      // Log the request body for debugging (limit to avoid huge logs)
      if (options.body) {
        const bodyPreview = typeof options.body === 'string' 
          ? options.body.substring(0, 500) 
          : JSON.stringify(options.body).substring(0, 500);
        logMessage(`[n8n] Request body: ${bodyPreview}...`);
      }
      console.log(`[n8n] Request URL: ${url}, Request options: ${JSON.stringify(options)}`);
      return fetch(url, options);
    },
    (response) => {
      logMessage(`[n8n] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // Capture more error details
        return response.text().then(text => {
          const errorDetails = `Status: ${response.status}, StatusText: ${response.statusText}, Body: ${text}`;
          logMessage(`[n8n] Error response: ${errorDetails}`);
          throw new Error(`Error in n8n response: ${errorDetails}`);
        });
      }
      return response;
    },
    (response) => response.json(),
    (data) => {
      logMessage(`[n8n] Data received: ${JSON.stringify(data).substring(0, 200)}...`);
      return deepFreeze(data);
    }
  )();
};

/**
 * Pure function to proxy a request to Zoho API
 * @param {String} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<Object>} - Promise with response data
 */
export const proxyZohoRequest = (endpoint, options = {}) => {
  const url = `${ZOHO_BASE_URL}${normalizePath(endpoint)}`;
  
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      ...createZohoHeaders(),
      ...(options.headers || {})
    },
  };

  // Add body if needed
  if (options.data) {
    fetchOptions.body = JSON.stringify(options.data);
  }
  
  return pipeAsync(
    () => logMessage(`Proxying request to Zoho: ${url}`),
    () => fetch(url, fetchOptions),
    async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zoho API request failed: ${response.status} ${errorText}`);
      }
      return response;
    },
    (response) => response.json(),
    (data) => deepFreeze(data)
  )();
};

/**
 * Pure function to get reports overview
 * Uses n8n workflow instead of direct Zoho API call
 * @returns {Promise<Object>} - Promise with reports data
 */
export const getReportsOverview = () => 
  fetchFromN8N('overview');

/**
 * Pure function to build query string from filters
 * @param {Object} filters - Query filters
 * @returns {String} - Query string
 */
const buildQueryString = (filters) => {
  const queryParams = new URLSearchParams();
  
  Object.entries(filters)
    .filter(([_, value]) => value !== undefined && value !== null)
    .forEach(([key, value]) => queryParams.append(key, String(value)));
  
  const queryString = queryParams.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * Pure function to get tickets with filters
 * @param {Object} filters - Query filters
 * @returns {Promise<Object>} - Promise with tickets data
 */
export const getTickets = (filters = {}) => {
  // Build query parameters
  const queryParams = Object.entries(filters)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .reduce((params, [key, value]) => {
      params.append(key, String(value));
      return params;
    }, new URLSearchParams());
  
  const queryString = queryParams.toString();
  const webhookPath = `zoho-tickets${queryString ? `?${queryString}` : ''}`;
  
  return fetchFromN8N(webhookPath);
};

/**
 * Pure function to get a ticket by ID
 * @param {String} id - Ticket ID
 * @returns {Promise<Object>} - Promise with ticket data
 */
export const getTicketById = (id) => 
  fetchFromN8N(`${ZOHO_TICKET_DETAIL_WEBHOOK}?ticketId=${id}`);

/**
 * Pure function to get categories
 * @returns {Promise<Object>} - Promise with categories data
 */
export const getCategories = () => 
  fetchFromN8N('zoho-categories');

/**
 * Pure function to create a ticket
 * @param {Object} ticketData - Ticket data
 * @returns {Promise<Object>} - Promise with created ticket data
 */
export const createTicket = (ticketData) => {
  // Validar que tengamos al menos los campos requeridos
  if (!ticketData || !ticketData.subject) {
    return Promise.reject(new Error('Ticket subject is required'));
  }
  
  // Normalizar los datos para asegurar compatibilidad con Zoho Desk API
  const normalizedData = {
    subject: ticketData.subject,
    description: ticketData.description || '',
    departmentId: ticketData.departmentId,
    contactId: ticketData.contactId,
    accountId: ticketData.accountId,
    category: ticketData.category || '',
    priority: ticketData.priority || 'medium',
    status: ticketData.status || 'open',
    dueDate: ticketData.dueDate,
    cf: ticketData.cf || {}
  };
  
  console.log('[zohoProxyService] Creating ticket with data:', 
    JSON.stringify(normalizedData).substring(0, 500));
  
  // Llamar al webhook de n8n para crear el ticket
  return fetchFromN8N(ZOHO_CREATE_TICKET_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(normalizedData)
  }).then(response => {
    console.log('[zohoProxyService] Respuesta completa de n8n:', 
      JSON.stringify(response).substring(0, 500));
    
    // Verificar que tengamos una respuesta válida
    if (!response) {
      console.error('[zohoProxyService] No se recibió respuesta del webhook de n8n');
      throw new Error('No se recibió respuesta del webhook de n8n');
    }
    
    // Si recibimos un error explícito, lanzarlo
    if (response.error) {
      console.error('[zohoProxyService] Error explícito en respuesta:', response.error);
      throw new Error(response.error);
    }
    
    // Verificar si la respuesta de n8n contiene un ticket
    if (!response.success) {
      console.error('[zohoProxyService] La respuesta no indica éxito:', response);
      throw new Error(response.message || 'No se pudo crear el ticket en Zoho Desk');
    }
    
    // Si no hay un objeto ticket, pero hay success, devolver la respuesta completa
    if (!response.ticket) {
      console.warn('[zohoProxyService] Respuesta exitosa pero sin ticket:', response);
      return response;
    }
    
    console.log('[zohoProxyService] Ticket creado correctamente:', response.ticket.id);
    return response;
  }).catch(error => {
    console.error('[zohoProxyService] Error al crear ticket:', error);
    console.error('[zohoProxyService] Stack trace:', error.stack);
    
    // Reformatear el error para mantener consistencia
    return {
      success: false,
      error: error.message || 'Error desconocido al crear el ticket',
      timestamp: new Date().toISOString()
    };
  });
};

/**
 * Pure function to update a ticket's status
 * @param {String} ticketId - Ticket ID
 * @param {String} status - New status (Open, In Progress, On Hold, Closed)
 * @returns {Promise<Object>} - Promise with updated ticket data
 */
export const updateTicketStatus = (ticketId, status) => 
  fetchFromN8N(`zoho-update-ticket/${ticketId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });

/**
 * Pure function to add a comment to a ticket
 * @param {String} ticketId - Ticket ID
 * @param {Object} commentData - Comment data
 * @returns {Promise<Object>} - Promise with comment data
 */
export const addComment = (ticketId, commentData) => {
  // Validar parámetros de forma funcional
  if (!ticketId || !commentData || !commentData.comment) {
    return Promise.reject(new Error('Missing required parameters: ticketId and comment'));
  }
  
  return fetchFromN8N(ZOHO_ADD_COMMENT_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      ticketId, 
      comment: commentData.comment,
      isPublic: commentData.isPublic !== false,
      author: commentData.author || 'Customer'
    })
  });
};

/**
 * Pure function to get filtered tickets
 * @param {Object} filters - Query filters (status, priority, departmentId)
 * @param {Number} limit - Number of tickets to return
 * @param {Number} from - Starting index for pagination
 * @returns {Promise<Object>} - Promise with tickets data
 */
export const getFilteredTickets = (filters = {}, limit = 50, from = 0) => {
  // Construir query params de forma funcional
  const queryParams = {
    ...filters,
    limit,
    from
  };
  
  // Usar URLSearchParams para crear una query string bien formada
  const queryString = new URLSearchParams(
    Object.entries(queryParams)
      .filter(([_, value]) => value !== undefined && value !== null && value !== '')
  ).toString();
  
  return fetchFromN8N(`${ZOHO_TICKETS_WEBHOOK}?${queryString}`);
};

/**
 * Pure function to get comments for a ticket
 * @param {String} ticketId - Ticket ID
 * @returns {Promise<Object>} - Promise with comments data
 */
export const getTicketComments = (ticketId) => {
  if (!ticketId) {
    return Promise.reject(new Error('Missing required parameter: ticketId'));
  }
  
  return fetchFromN8N(`${ZOHO_GET_COMMENTS_WEBHOOK}?ticketId=${ticketId}`);
};

/**
 * Pure function to get Zoho contacts
 * @returns {Promise<Object>} - Promise with contacts data
 */
export const getContacts = () => 
  fetchFromN8N(ZOHO_CONTACTS_WEBHOOK);

/**
 * Pure function to get Zoho accounts
 * @returns {Promise<Object>} - Promise with accounts data
 */
export const getAccounts = () =>
  fetchFromN8N(ZOHO_ACCOUNTS_WEBHOOK);

/**
 * Pure function to get Zoho Knowledge Base articles
 * @param {Object} options - Query options (category, search, etc.)
 * @returns {Promise<Object>} - Promise with KB articles data
 */
export const getKbArticles = (options = {}) => {
  // Build query string if options provided
  const queryParams = new URLSearchParams();
  Object.entries(options)
    .filter(([_, value]) => value !== undefined && value !== null && value !== '')
    .forEach(([key, value]) => queryParams.append(key, String(value)));
  
  const queryString = queryParams.toString();
  const endpoint = `/api/zoho/kb-articles${queryString ? `?${queryString}` : ''}`;
  
  return fetchFromN8N(endpoint);
};
