/**
 * External clients setup (Supabase, Zoho)
 * Part of the imperative shell that handles side effects
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Result, tryCatchAsync, deepFreeze } from '../utils/functional.js'

const { 
  ZOHO_AUTH_TOKEN, 
  ZOHO_BASE_URL, 
  PORT = 3000,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
} = process.env

if (!ZOHO_AUTH_TOKEN || !ZOHO_BASE_URL) throw new Error('Missing Zoho env vars')
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Missing Supabase env vars')

// Supabase client for event store
export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Zoho client for ticket management and authentication
export const zohoClient = {
  // GET request to Zoho API
  get: async (endpoint) => {
    return tryCatchAsync(async () => {
      const response = await fetch(`${ZOHO_BASE_URL}${endpoint}`, {
        headers: { Authorization: `Zoho-oauthtoken ${ZOHO_AUTH_TOKEN}` },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify({
          status: response.status,
          message: errorData.message || `HTTP error ${response.status}`,
          details: errorData
        }));
      }
      
      const data = await response.json();
      return deepFreeze(data);
    })();
  },

  // POST request to Zoho API
  post: async (endpoint, body) => {
    return tryCatchAsync(async () => {
      const response = await fetch(`${ZOHO_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${ZOHO_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify({
          status: response.status,
          message: errorData.message || `HTTP error ${response.status}`,
          details: errorData
        }));
      }
      
      const data = await response.json();
      return deepFreeze(data);
    })();
  },

  // PUT request to Zoho API
  put: async (endpoint, body) => {
    return tryCatchAsync(async () => {
      const response = await fetch(`${ZOHO_BASE_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
          Authorization: `Zoho-oauthtoken ${ZOHO_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify({
          status: response.status,
          message: errorData.message || `HTTP error ${response.status}`,
          details: errorData
        }));
      }
      
      const data = await response.json();
      return deepFreeze(data);
    })();
  },
  
  // Authenticate user with Zoho
  authenticate: async (email, password) => {
    return tryCatchAsync(async () => {
      const response = await fetch(`${ZOHO_BASE_URL}/auth/validate`, {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${ZOHO_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(JSON.stringify({
          status: response.status,
          message: errorData.message || 'Authentication failed',
          details: errorData
        }));
      }
      
      const data = await response.json();
      
      if (!data.status || data.status !== 'success') {
        throw new Error(JSON.stringify({
          status: 401,
          message: data.message || 'Invalid credentials',
          details: data
        }));
      }
      
      return deepFreeze({
        userId: data.data?.userId,
        userDetails: data.data
      });
    })();
  }
}

export const config = { PORT }
