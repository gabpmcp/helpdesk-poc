/**
 * n8n client for external workflow operations
 * Part of the imperative shell that handles side effects
 */
import 'dotenv/config';
import { Result, tryCatchAsync, deepFreeze } from '../utils/functional.js';

const {
  N8N_BASE_URL,
  N8N_ZOHO_CONTACT_CHECK_PATH,
  N8N_ZOHO_GET_COMPANIES_PATH
} = process.env;

// Validate environment variables
if (!N8N_BASE_URL) {
  console.warn('⚠️ Warning: Missing N8N_BASE_URL environment variable. n8n integration will be limited.');
}

/**
 * Performs a fetch request to n8n endpoint
 * @param {string} path - API path
 * @param {Object} data - Request body data
 * @returns {Promise<Object>} - Response data
 */
const fetchFromN8n = async (path, data) => {
  const response = await fetch(`${N8N_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });

  console.log('🔗 Fetching data from n8n:', `${N8N_BASE_URL}${path}`);
  // console.log('🔗 Response:', responseText);

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const errorJson = JSON.parse(errorText);
      throw new Error(JSON.stringify({
        status: response.status,
        message: errorJson.message || 'n8n request failed',
        details: errorJson.details || { errorCode: 'N8N_REQUEST_FAILED' }
      }));
    } catch (e) {
      if (e.message.includes('JSON')) {
        throw new Error(JSON.stringify({
          status: response.status,
          message: errorText || 'n8n request failed',
          details: { errorCode: 'N8N_REQUEST_FAILED' }
        }));
      }
      throw e;
    }
  }
  
  const { data: result } = await response.json();

  return result;
};

/**
 * Checks if a contact exists in Zoho CRM via n8n workflow
 * @param {string} email - Email to check
 * @returns {Promise<Result>} - Result with contact data or error
 */
export const verifyZohoContact = async (email) => {
  return tryCatchAsync(async () => {
    if (!N8N_BASE_URL || !N8N_ZOHO_CONTACT_CHECK_PATH) {
      console.error('❌ n8n configuration missing for Zoho contact verification');
      throw new Error(JSON.stringify({
        status: 503,
        message: 'n8n service not configured',
        details: { errorCode: 'N8N_NOT_CONFIGURED', message: 'n8n service not configured for Zoho operations' }
      }));
    }

    console.log('🔍 Verifying Zoho contact via n8n workflow:', email);
    const data = await fetchFromN8n(N8N_ZOHO_CONTACT_CHECK_PATH, { email });
    
    if (!data) {
      console.error('❌ Contact not found in Zoho CRM:', email);
      throw new Error(JSON.stringify({
        status: 404,
        message: 'Contact not found in Zoho CRM',
        details: { 
          errorCode: 'CONTACT_NOT_FOUND', 
          message: data.error || 'Contact not found in Zoho CRM'
        }
      }));
    }
    
    console.log('✅ Contact verified in Zoho CRM:', email);
    return deepFreeze({
      contact: data?.map(({ id, Full_Name, Account_Name: { id: accountId, name: accountName } }) => ({id, name: Full_Name, accountId, accountName }))[0],
      payload: data.contact
    });
  })();
};

/**
 * Gets companies associated with a contact in Zoho CRM via n8n workflow
 * @param {string} contactId - Zoho contact ID
 * @returns {Promise<Result>} - Result with companies data or error
 */
export const getZohoCompanies = async (contactId) => {
  return tryCatchAsync(async () => {
    if (!N8N_BASE_URL || !N8N_ZOHO_GET_COMPANIES_PATH) {
      console.error('❌ n8n configuration missing for Zoho companies retrieval');
      throw new Error(JSON.stringify({
        status: 503,
        message: 'n8n service not configured',
        details: { errorCode: 'N8N_NOT_CONFIGURED', message: 'n8n service not configured for Zoho operations' }
      }));
    }

    console.log('🔍 Getting companies for contact via n8n workflow:', contactId);
    const data = await fetchFromN8n(N8N_ZOHO_GET_COMPANIES_PATH, { contactId });
    
    if (!data) {
      console.error('❌ Failed to get companies for contact:', contactId);
      throw new Error(JSON.stringify({
        status: 500,
        message: 'Failed to get companies for contact',
        details: { 
          errorCode: 'COMPANIES_RETRIEVAL_FAILED', 
          message: data.error || 'Failed to get companies for contact'
        }
      }));
    }
    
    console.log('✅ Companies retrieved for contact:', contactId);
    return deepFreeze({
      companies: data.companies || []
    });
  })();
};

/**
 * Alias for getZohoCompanies to maintain compatibility with existing code
 */
export const getUserCompanies = getZohoCompanies;

/**
 * Authenticate user via n8n workflow (for backward compatibility)
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<Result>} - Result with authentication data or error
 */
export const authenticate = async (email, password) => {
  console.warn('⚠️ Using deprecated authenticate method. Consider using verifyZohoContact instead.');
  return verifyZohoContact(email);
};

/**
 * Create a ticket via n8n workflow
 * @param {Object} ticket - Ticket data
 * @returns {Promise<Result>} - Result with ticket data or error
 */
export const createTicket = async (ticket) => {
  return tryCatchAsync(async () => {
    console.error('❌ Ticket creation via n8n not implemented yet');
    throw new Error(JSON.stringify({
      status: 501,
      message: 'Ticket creation via n8n not implemented yet',
      details: { errorCode: 'NOT_IMPLEMENTED', message: 'This feature is not implemented yet' }
    }));
  })();
};

/**
 * Update a ticket via n8n workflow
 * @param {Object} ticket - Ticket data
 * @returns {Promise<Result>} - Result with ticket data or error
 */
export const updateTicket = async (ticket) => {
  return tryCatchAsync(async () => {
    console.error('❌ Ticket update via n8n not implemented yet');
    throw new Error(JSON.stringify({
      status: 501,
      message: 'Ticket update via n8n not implemented yet',
      details: { errorCode: 'NOT_IMPLEMENTED', message: 'This feature is not implemented yet' }
    }));
  })();
};

/**
 * Add a comment to a ticket via n8n workflow
 * @param {Object} comment - Comment data
 * @returns {Promise<Result>} - Result with comment data or error
 */
export const addComment = async (comment) => {
  return tryCatchAsync(async () => {
    console.error('❌ Comment addition via n8n not implemented yet');
    throw new Error(JSON.stringify({
      status: 501,
      message: 'Comment addition via n8n not implemented yet',
      details: { errorCode: 'NOT_IMPLEMENTED', message: 'This feature is not implemented yet' }
    }));
  })();
};

/**
 * Escalate a ticket via n8n workflow
 * @param {Object} ticket - Ticket data
 * @returns {Promise<Result>} - Result with ticket data or error
 */
export const escalateTicket = async (ticket) => {
  return tryCatchAsync(async () => {
    console.error('❌ Ticket escalation via n8n not implemented yet');
    throw new Error(JSON.stringify({
      status: 501,
      message: 'Ticket escalation via n8n not implemented yet',
      details: { errorCode: 'NOT_IMPLEMENTED', message: 'This feature is not implemented yet' }
    }));
  })();
};

export default {
  verifyZohoContact,
  getZohoCompanies,
  getUserCompanies,
  authenticate,
  createTicket,
  updateTicket,
  addComment,
  escalateTicket
};
