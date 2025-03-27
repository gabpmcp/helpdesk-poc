/**
 * External clients setup (Supabase, Zoho)
 * Part of the imperative shell that handles side effects
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { tryCatchAsync, deepFreeze } from '../utils/functional.js'

const { 
  ZOHO_AUTH_TOKEN, 
  ZOHO_BASE_URL, 
  PORT = 3000,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_ANON_KEY
} = process.env

const supabaseAdminClient = (() =>
  SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    : null
)();

// ✅ Named export correctamente definido
export const getSupabaseAdminClient = () => supabaseAdminClient;

// Validar variables de entorno de Zoho
if (!ZOHO_AUTH_TOKEN || !ZOHO_BASE_URL) {
  console.warn('⚠️ Warning: Missing Zoho environment variables. Some functionality may be limited.')
}

// Validar variables de entorno de Supabase
let supabaseConfigured = false
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('⚠️ Warning: Missing Supabase environment variables. Authentication will fall back to mock mode.')
} else {
  supabaseConfigured = true
  console.log('✅ Supabase configured with URL:', SUPABASE_URL)
}

// Export configuration for use in other modules
export const config = {
  PORT,
  ZOHO_AUTH_TOKEN,
  ZOHO_BASE_URL,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_ANON_KEY,
  supabaseConfigured
}

// Supabase client for event store (solo si está configurado)
export const supabaseClient = supabaseConfigured 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null

// Supabase authentication functions
export const supabaseAuth = {
  // Authenticate user with Supabase
  signIn: async (email, password) => {
    return tryCatchAsync(async () => {
      if (!supabaseConfigured || !supabaseClient) {
        console.error('❌ Supabase authentication is not configured');
        throw new Error(JSON.stringify({
          status: 503,
          message: 'Supabase authentication is not configured',
          details: { errorCode: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase authentication is not configured' }
        }));
      }
      
      console.log('🔑 Attempting to authenticate user with Supabase:', email);
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error('❌ Supabase authentication error:', error);
        throw new Error(JSON.stringify({
          status: error.status || 401,
          message: error.message || 'Authentication failed',
          details: { errorCode: error.code, message: error.message }
        }));
      }
      
      if (!data || !data.user) {
        console.error('❌ Supabase returned no user data');
        throw new Error(JSON.stringify({
          status: 401,
          message: 'Authentication failed - no user data',
          details: { errorCode: 'NO_USER_DATA', message: 'No user data returned from authentication service' }
        }));
      }
      
      console.log('✅ User authenticated successfully with Supabase:', data.user.email);
      return deepFreeze({
        userId: data.user.id,
        email: data.user.email,
        userDetails: data.user,
        session: data.session
      });
    })();
  },
  
  // Sign up a new user with Supabase
  signUp: async (email, password) => {
    return tryCatchAsync(async () => {
      if (!supabaseConfigured || !supabaseClient) {
        console.error('❌ Supabase authentication is not configured');
        throw new Error(JSON.stringify({
          status: 503,
          message: 'Supabase authentication is not configured',
          details: { errorCode: 'SUPABASE_NOT_CONFIGURED', message: 'Supabase authentication is not configured' }
        }));
      }
      
      console.log('🔑 Attempting to sign up user with Supabase:', email);
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password
      });
      
      if (error) {
        console.error('❌ Supabase sign up error:', error);
        throw new Error(JSON.stringify({
          status: error.status || 400,
          message: error.message || 'Registration failed',
          details: { errorCode: error.code, message: error.message }
        }));
      }
      
      if (!data || !data.user) {
        console.error('❌ Supabase returned no user data');
        throw new Error(JSON.stringify({
          status: 400,
          message: 'Registration failed - no user data',
          details: { errorCode: 'NO_USER_DATA', message: 'No user data returned from authentication service' }
        }));
      }
      
      console.log('✅ User signed up successfully with Supabase:', data.user.email);
      return deepFreeze({
        userId: data.user.id,
        email: data.user.email,
        userDetails: data.user,
        session: data.session
      });
    })();
  }
};

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
  
  // Verify if a user exists in Zoho CRM
  verifyUserExists: async (email) => {
    return tryCatchAsync(async () => {
      // Buscar el usuario por email en Zoho CRM
      const response = await fetch(`${ZOHO_BASE_URL}/contacts/search?email=${encodeURIComponent(email)}`, {
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
      
      // Verificar si se encontró el usuario
      if (!data.data || data.data.length === 0) {
        throw new Error(JSON.stringify({
          status: 404,
          message: 'User not found in Zoho CRM',
          details: { errorCode: 'USER_NOT_FOUND', message: 'User not found in Zoho CRM' }
        }));
      }
      
      return deepFreeze({
        userId: data.data[0].id,
        userDetails: data.data[0]
      });
    })();
  },
  
  // Get companies associated with a user in Zoho CRM
  getUserCompanies: async (userId) => {
    return tryCatchAsync(async () => {
      // Buscar las compañías asociadas al usuario
      const response = await fetch(`${ZOHO_BASE_URL}/contacts/${userId}/companies`, {
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
      
      return deepFreeze({
        companies: data.data || []
      });
    })();
  },
  
  // Authenticate user with Zoho (legacy, mantained for compatibility)
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
