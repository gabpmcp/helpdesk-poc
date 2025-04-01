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
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'http://localhost:5678';

// Los webhooks de n8n sin barras iniciales para evitar doble slash cuando se concatenan con N8N_BASE_URL
const ZOHO_CATEGORIES_WEBHOOK = 'zoho-categories';
const ZOHO_TICKETS_WEBHOOK = 'zoho-tickets';
const ZOHO_TICKET_DETAIL_WEBHOOK = 'zoho-ticket-detail';
const ZOHO_CREATE_TICKET_WEBHOOK = 'zoho-create-ticket';
const ZOHO_UPDATE_TICKET_WEBHOOK = 'zoho-update-ticket';
const ZOHO_ADD_COMMENT_WEBHOOK = 'zoho-add-comment';

// Helper para construir URLs correctamente con o sin slash final en la base URL
const buildN8nUrl = (basePath, endpoint) => {
  // Aseguramos que haya un slash entre la base y el endpoint
  if (basePath.endsWith('/')) {
    return `${basePath}${endpoint}`;
  }
  return `${basePath}/${endpoint}`;
};

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
  
  return pipeAsync(
    () => logMessage(`Fetching data from n8n: ${url} with method ${options.method || 'GET'}`),
    () => fetch(url, options),
    (response) => {
      if (!response.ok) {
        // Capturar más detalles sobre errores
        return response.text().then(text => {
          const errorDetails = `Status: ${response.status}, StatusText: ${response.statusText}, Body: ${text}`;
          logMessage(`Error en la respuesta de n8n: ${errorDetails}`);
          throw new Error(`Error en la respuesta de n8n: ${errorDetails}`);
        });
      }
      return response;
    },
    (response) => response.json(),
    (data) => {
      logMessage(`Datos recibidos de n8n: ${JSON.stringify(data).substring(0, 200)}...`);
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
  fetchFromN8N('/api/zoho/reports-overview');

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
  fetchFromN8N(`zoho-ticket-detail/${id}`);

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
export const createTicket = (ticketData) => 
  fetchFromN8N('zoho-create-ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ticketData)
  });

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
export const addComment = (ticketId, commentData) => 
  fetchFromN8N(`zoho-add-comment/${ticketId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commentData)
  });
