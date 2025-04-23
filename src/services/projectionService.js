/**
 * Projection Service - FCIS pattern compliant
 * Functional, Composable, Isolated, Stateless
 * 
 * This service provides pure projections of data from external sources (n8n)
 * following functional programming principles
 */
import { Result, tryCatchAsync, deepFreeze, pipe } from '../utils/functional.js';

// n8n configuration (should be in environment variables in production)
const N8N_BASE_URL = process.env.N8N_BASE_URL || 'https://n8n.advancio.io';

// Normaliza la URL base para evitar problemas con barras al final
const normalizeBaseUrl = (url) => {
  if (!url) return '';
  // Elimina la barra al final si existe
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

// Normaliza el path para asegurarse de que empiece con barra pero no tenga /webhook duplicado
const normalizePath = (path, baseUrl) => {
  if (!path) return '';
  
  // Si la baseUrl ya contiene /webhook y el path también lo incluye, evitamos duplicación
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const baseHasWebhook = baseUrl.includes('/webhook');
  
  if (baseHasWebhook && normalizedPath.startsWith('/webhook')) {
    console.log('[normalizePath] Avoiding duplicate /webhook in path');
    return normalizedPath.replace('/webhook', '');
  }
  
  return normalizedPath;
};

/**
 * Pure function to fetch data from n8n webhook
 * @param {String} webhookPath - Path to n8n webhook
 * @returns {Promise<Result<Object, Error>>} - Result with data or error
 */
const fetchFromN8N = (webhookPath) => {
  // Devolver una función que, cuando se ejecute, realizará la petición
  const fetchFn = async () => {
    try {
      const normalizedBaseUrl = normalizeBaseUrl(N8N_BASE_URL);
      const normalizedPath = normalizePath(webhookPath, normalizedBaseUrl);
      const url = `${normalizedBaseUrl}${normalizedPath}`;
      
      console.log(`[fetchFromN8N] Fetching data from n8n: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[fetchFromN8N] Response not OK: ${response.status} ${response.statusText}`);
        throw new Error(`n8n fetch failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log(`[fetchFromN8N] Received data:`, JSON.stringify(data).substring(0, 200) + '...');
      
      // Verificar si los datos están vacíos o tienen valores en cero
      if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
        console.warn('[fetchFromN8N] Received empty data object from n8n');
      } else if (data.ticketCount === 0 && data.openTicketCount === 0) {
        console.warn('[fetchFromN8N] Received data with all zero values, might indicate an issue with n8n integration');
      }
      
      return Result.ok(data);
    } catch (error) {
      console.error(`[fetchFromN8N] Fetch error:`, error);
      return Result.error(error);
    }
  };
  
  return fetchFn;
};

/**
 * Pure function to project dashboard overview data
 * @param {Object} rawData - Raw data from n8n
 * @returns {Object} - Projected data
 */
const projectDashboardOverview = (rawData) => deepFreeze({
  metrics: rawData.metrics || {},
  ticketCount: rawData.ticketCount || 0,
  openTicketCount: rawData.openTicketCount || 0,
  urgentTicketCount: rawData.urgentTicketCount || 0,
  responseTimeAvg: rawData.responseTimeAvg || 0,
  satisfactionScore: rawData.satisfactionScore || 0,
  lastUpdated: rawData.timestamp || new Date().toISOString(),
  source: "zoho"
});

/**
 * Pure function to project dashboard tickets data
 * @param {Object} rawData - Raw data from n8n
 * @returns {Object} - Projected data
 */
const projectTickets = (rawData) => deepFreeze({
  tickets: (rawData.tickets || []).map(ticket => ({
    id: ticket.id,
    subject: ticket.subject,
    status: ticket.status,
    priority: ticket.priority,
    department: ticket.departmentName,
    contact: ticket.contactName,
    createdAt: ticket.createdTime,
    updatedAt: ticket.modifiedTime
  })),
  meta: rawData.meta || {},
  lastUpdated: rawData.timestamp || new Date().toISOString(),
  source: "zoho"
});

/**
 * Pure function to project dashboard contacts data
 * @param {Object} rawData - Raw data from n8n
 * @returns {Object} - Projected data
 */
const projectContacts = (rawData) => deepFreeze({
  contacts: (rawData.contacts || []).map(contact => ({
    id: contact.id,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    type: contact.type,
    createdAt: contact.createdTime,
    updatedAt: contact.modifiedTime
  })),
  meta: rawData.meta || {},
  lastUpdated: rawData.timestamp || new Date().toISOString(),
  source: "zoho"
});

/**
 * Pure function to project reports overview data (new endpoint)
 * @param {Object} rawData - Raw data from n8n
 * @returns {Object} - Projected data
 */
const projectReportsOverview = (rawData) => deepFreeze({
  ticketCount: rawData.ticketCount || 0,
  openTicketCount: rawData.openTicketCount || 0,
  urgentTicketCount: rawData.urgentTicketCount || 0,
  responseTimeAvg: rawData.responseTimeAvg || 0,
  satisfactionScore: rawData.satisfactionScore || 0,
  metrics: {
    ticketsByPriority: rawData.metrics?.ticketsByPriority || {
      Low: 0,
      Medium: 0,
      High: 0,
      Urgent: 0
    },
    ticketsByStatus: rawData.metrics?.ticketsByStatus || {
      Open: 0, 
      'In Progress': 0,
      Closed: 0,
      'On Hold': 0
    }
  },
  timestamp: rawData.timestamp || new Date().toISOString(),
  source: "zoho"
});

/**
 * Pure function to project Zoho categories/departments data
 * @param {Object} rawData - Raw data from n8n
 * @returns {Object} - Projected data
 */
const projectCategories = (rawData) => deepFreeze({
  categories: Array.isArray(rawData) 
    ? rawData.map(category => ({
        id: category.id || '',
        name: category.name || category.departmentName || '',
        departmentId: category.departmentId || category.id || ''
      }))
    : (rawData.categories || []).map(category => ({
        id: category.id || '',
        name: category.name || category.departmentName || '',
        departmentId: category.departmentId || category.id || ''
      })),
  timestamp: rawData.timestamp || new Date().toISOString(),
  source: "zoho"
});

/**
 * Compose a function to fetch and project dashboard overview data
 * @returns {Function} - Async function that returns projected data
 */
export const getDashboardOverview = pipe(
  fetchFromN8N('/projections/dashboard/overview'),
  result => result.map(projectDashboardOverview)
);

/**
 * Compose a function to fetch and project dashboard tickets data
 * @returns {Function} - Async function that returns projected data
 */
export const getDashboardTickets = pipe(
  fetchFromN8N('/webhook/zoho-tickets'),
  result => result.map(projectTickets)
);

/**
 * Compose a function to fetch and project dashboard contacts data
 * @returns {Function} - Async function that returns projected data
 */
export const getDashboardContacts = pipe(
  fetchFromN8N('/projections/dashboard/contacts'),
  result => result.map(projectContacts)
);

/**
 * Compose a function to fetch and project reports overview data
 * @returns {Function} - Async function that returns projected data
 */
export const getReportsOverview = async () => {
  try {
    // Obtener los datos usando la función fetchFromN8N
    const fetchFn = fetchFromN8N('overview');
    const result = await fetchFn();
    
    console.log('[getReportsOverview] Fetch result:', result);
    
    // Verificar si tenemos un Result válido
    if (result && result.isOk) {
      // Transformar los datos utilizando la función de proyección
      const data = result.unwrap();
      console.log('[getReportsOverview] Unwrapped data:', JSON.stringify(data).substring(0, 200) + '...');
      return Result.ok(projectReportsOverview(data));
    }
    
    // Si llegamos aquí, ocurrió un error
    if (result && result.isError) {
      console.error('[getReportsOverview] Error in result:', result.unwrapError());
      return result; // Devolver el error
    }
    
    // Error genérico
    return Result.error(new Error('Invalid response from n8n webhook'));
  } catch (error) {
    console.error('[getReportsOverview] Unexpected error:', error);
    return Result.error(error);
  }
};

/**
 * Compose a function to fetch and project Zoho categories/departments data
 * @returns {Function} - Async function that returns projected data
 */
export const getZohoCategories = async () => {
  try {
    // Mostrar claramente la URL que estamos intentando consultar
    const webhookPath = 'webhook/zoho-categories';
    const normalizedBaseUrl = normalizeBaseUrl(N8N_BASE_URL);
    const normalizedPath = normalizePath(webhookPath, normalizedBaseUrl);
    const url = `${normalizedBaseUrl}/${normalizedPath}`;
    
    console.log(`[getZohoCategories] Intentando obtener categorías desde: ${url}`);
    
    // Obtener los datos usando la función fetchFromN8N con el path corregido
    const fetchFn = fetchFromN8N(webhookPath);
    const result = await fetchFn();
    
    console.log('[getZohoCategories] Fetch result:', result);
    
    // Verificar si tenemos un Result válido
    if (result && result.isOk) {
      // Transformar los datos utilizando la función de proyección
      const data = result.unwrap();
      console.log('[getZohoCategories] Unwrapped data:', JSON.stringify(data).substring(0, 200) + '...');
      return Result.ok(projectCategories(data));
    }
    
    // Si llegamos aquí, ocurrió un error
    if (result && result.isError) {
      console.error('[getZohoCategories] Error in result:', result.unwrapError());
      return result; // Devolver el error
    }
    
    // Error genérico
    return Result.error(new Error('Invalid response from zoho-categories webhook'));
  } catch (error) {
    console.error('[getZohoCategories] Unexpected error:', error);
    // Proporcionar datos estáticos de fallback para evitar error total
    console.warn('[getZohoCategories] Devolviendo categorías de fallback debido al error');
    return Result.ok(projectCategories([
      { id: 'fallback1', name: 'General', departmentId: 'fallback1' },
      { id: 'fallback2', name: 'Soporte Técnico', departmentId: 'fallback2' },
      { id: 'fallback3', name: 'Ventas', departmentId: 'fallback3' }
    ]));
  }
};
