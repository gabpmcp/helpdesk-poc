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

/**
 * Pure function to fetch data from n8n webhook
 * @param {String} webhookPath - Path to n8n webhook
 * @returns {Promise<Result<Object, Error>>} - Result with data or error
 */
const fetchFromN8N = (webhookPath) => async () => {
  return tryCatchAsync(async () => {
    // Ensure path starts with /
    const normalizedPath = webhookPath.startsWith('/') ? webhookPath : `/${webhookPath}`;
    const url = `${N8N_BASE_URL}${normalizedPath}`;
    
    console.log(`Fetching data from n8n: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`n8n fetch failed: ${response.status} ${errorText}`);
    }
    
    const data = await response.json();
    return deepFreeze(data);
  });
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
export const getReportsOverview = pipe(
  fetchFromN8N('/webhook/overview'),
  result => result.map(projectReportsOverview)
);
