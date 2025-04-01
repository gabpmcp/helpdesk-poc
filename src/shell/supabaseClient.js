/**
 * Supabase client configuration - part of the imperative shell
 * Handles external service connection
 */
import { createClient } from '@supabase/supabase-js';
import { Result, tryCatchAsync } from '../utils/functional.js';

// Supabase configuration (should be in env vars in production)
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

/**
 * Create and initialize the Supabase client
 * @returns {Object} - Supabase client instance
 */
export const createSupabaseClient = () => {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: false
    }
  });
};

/**
 * Testing the Supabase connection
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {Promise<Result<boolean, Error>>} - Result indicating if connection is successful
 */
export const testSupabaseConnection = (supabaseClient) => {
  return tryCatchAsync(async () => {
    // Simple query to test the connection
    const { data, error } = await supabaseClient
      .from('events')
      .select('id')
      .limit(1);
    
    if (error) {
      console.error('Supabase connection error:', error.message);
      return Result.error(error);
    }
    
    return Result.ok(true);
  })();
};

// Create default instance
const supabaseClient = createSupabaseClient();

export default supabaseClient;
