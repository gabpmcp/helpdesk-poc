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
 * Pure function to build a URL
 * @param {String} baseUrl - Base URL
 * @param {String} path - Path to append
 * @returns {String} - Complete URL
 */
const buildUrl = (baseUrl, path) => 
  `${baseUrl}${normalizePath(path)}`;

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
 * @param {String} webhookPath - Path to n8n webhook
 * @returns {Promise<Object>} - Promise with data
 */
export const fetchFromN8N = (webhookPath) => {
  const url = buildUrl(N8N_BASE_URL, webhookPath);
  
  return pipeAsync(
    () => logMessage(`Fetching data from n8n: ${url}`),
    () => fetch(url),
    async (response) => {
      // console.log({response});
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`n8n fetch failed: ${response.status} ${errorText}`);
      }
      return response;
    },
    (response) => response.json(),
    (data) => deepFreeze(data)
  )();
};

/**
 * Pure function to proxy a request to Zoho API
 * @param {String} endpoint - API endpoint
 * @param {Object} options - Request options
 * @returns {Promise<Object>} - Promise with response data
 */
export const proxyZohoRequest = (endpoint, options = {}) => {
  const url = buildUrl(ZOHO_BASE_URL, endpoint);
  
  const fetchOptions = {
    ...options,
    headers: {
      ...createZohoHeaders(),
      ...(options.headers || {})
    }
  };
  
  return pipeAsync(
    () => logMessage(`Proxying request to: ${url}`),
    () => fetch(url, fetchOptions),
    async (response) => {
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.error || 'Unknown error';
        } catch {
          errorMessage = errorText || 'Unknown error';
        }
        
        throw new Error(`Zoho API error: ${response.status} ${errorMessage}`);
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
 * Pure function to get tickets with filtering options
 * @param {Object} filters - Query filters (e.g., status, client email)
 * @returns {Promise<Object>} - Promise with tickets data
 */
export const getTickets = (filters = {}) => {
  // Build query parameters
  const queryParams = new URLSearchParams();
  
  Object.entries(filters)
    .filter(([_, value]) => value !== undefined && value !== null)
    .forEach(([key, value]) => queryParams.append(key, String(value)));
  
  const queryString = queryParams.toString();
  
  return fetchFromN8N(`/webhook/zoho/tickets${queryString ? `?${queryString}` : ''}`);
};

/**
 * Pure function to get a ticket by ID with full details
 * @param {String} ticketId - Ticket ID
 * @returns {Promise<Object>} - Promise with ticket details
 */
export const getTicketById = (ticketId) => {
  return fetchFromN8N(`/webhook/zoho/ticket/${ticketId}`);
};

/**
 * Pure function to create a new ticket
 * @param {Object} ticketData - Ticket data (subject, description, etc.)
 * @returns {Promise<Object>} - Promise with created ticket data
 */
export const createTicket = (ticketData) => {
  return fetchFromN8N('/webhook/zoho/create-ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ticketData)
  });
};

/**
 * Pure function to update a ticket's status
 * @param {String} ticketId - Ticket ID
 * @param {String} status - New status (Open, In Progress, On Hold, Closed)
 * @returns {Promise<Object>} - Promise with updated ticket data
 */
export const updateTicketStatus = (ticketId, status) => {
  return fetchFromN8N(`/webhook/zoho/update-ticket/${ticketId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status })
  });
};

/**
 * Pure function to add a comment to a ticket
 * @param {String} ticketId - Ticket ID
 * @param {Object} commentData - Comment data (message, attachments, etc.)
 * @returns {Promise<Object>} - Promise with comment data
 */
export const addTicketComment = (ticketId, commentData) => {
  return fetchFromN8N(`/webhook/zoho/add-comment/${ticketId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commentData)
  });
};

/**
 * Pure function to get categories
 * @returns {Promise<Object>} - Promise with categories data
 */
export const getCategories = () => 
  proxyZohoRequest('/api/v1/categories');

/**
 * Pure function to add a comment to a ticket
 * @param {String} ticketId - Ticket ID
 * @param {Object} commentData - Comment data (message, attachments, etc.)
 * @returns {Promise<Object>} - Promise with comment data
 */
export const addComment = (ticketId, commentData) => 
  proxyZohoRequest(`/api/v1/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: JSON.stringify(commentData)
  });
