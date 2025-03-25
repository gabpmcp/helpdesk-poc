/**
 * Event store implementation using functional-declarative principles
 * Part of the imperative shell that handles side effects
 */
import { v4 as generateUUID } from 'uuid';
import { Result, tryCatchAsync, deepFreeze } from '../utils/functional.js';

// Event store table name - updated to match our new schema
const EVENTS_TABLE = 'events';
const USER_ACTIVITY_TABLE = 'user_activity';

/**
 * Generic query function type definition
 * @typedef {(params: {table: string, filters?: Object, select?: string, order?: string}) => Promise<{data: any[], error: Error|null}>} QueryFn
 */

/**
 * Generic persist function type definition
 * @typedef {(table: string, data: Object) => Promise<{data: any, error: Error|null}>} PersistFn
 */

/**
 * Stores an event in the event store
 * Returns a Result with the stored event or an error
 * @param {PersistFn} persistFn - Function to persist data
 */
export const storeEvent = (persistFn) => async (event) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    // Ensure event has a timestamp if not already present
    const eventWithTimestamp = deepFreeze({
      ...event,
      timestamp: event.timestamp || Date.now()
    });

    // Insert into the events table with the new schema
    const result = await persistFn(EVENTS_TABLE, {
      id: generateUUID(),
      user_id: event.userId,
      type: event.type,
      payload: eventWithTimestamp
    });
      
    if (result.error) {
      return Promise.reject(new Error(`Failed to store event: ${result.error.message}`));
    }
    
    // For authentication events, also track in user_activity table
    if (
      event.type === 'LOGIN_SUCCEEDED' || 
      event.type === 'TOKEN_REFRESHED' || 
      event.type === 'INVALID_REFRESH_TOKEN'
    ) {
      const activityResult = await persistFn(USER_ACTIVITY_TABLE, {
        user_id: event.userId,
        activity_type: event.type,
        timestamp: eventWithTimestamp.timestamp
      });
        
      if (activityResult.error) {
        console.error(`Failed to store user activity: ${activityResult.error.message}`);
        // Continue execution even if activity logging fails
      }
    }
    
    return eventWithTimestamp;
  })();
};

/**
 * Fetches events by user and optional filters
 * @param {QueryFn} queryFn - Function to query data
 */
export const fetchEventsByUserAndFilters = (queryFn) => async (params) => {
  return tryCatchAsync(async () => {
    const { userId, filters = {}, select = 'payload', order = 'created_at' } = params;
    
    const queryParams = {
      table: EVENTS_TABLE,
      filters: {
        user_id: userId,
        ...filters
      },
      select,
      order
    };
    
    const result = await queryFn(queryParams);
      
    if (result.error) {
      return Promise.reject(new Error(`Failed to fetch events: ${result.error.message}`));
    }
    
    // Map and freeze each event to ensure immutability
    const events = (result.data?.map(item => item.payload) || []).map(deepFreeze);
    return events;
  })();
};

/**
 * Fetches all events for a specific user
 * Returns a Result with the events or an error
 */
export const fetchEventsForUser = (queryFn) => async (userId) => {
  return fetchEventsByUserAndFilters(queryFn)({
    userId,
    filters: {}
  });
};

/**
 * Fetches events of a specific type for a user
 * Returns a Result with the events or an error
 */
export const fetchEventsByType = (queryFn) => async (userId, eventType) => {
  return fetchEventsByUserAndFilters(queryFn)({
    userId,
    filters: {
      type: eventType
    }
  });
};

/**
 * Fetches events related to a specific ticket
 * Returns a Result with the events or an error
 */
export const fetchTicketEvents = (queryFn) => async (ticketId) => {
  return tryCatchAsync(async () => {
    const queryParams = {
      table: EVENTS_TABLE,
      filters: {
        ticketId
      },
      select: 'payload',
      order: 'created_at'
    };
    
    const result = await queryFn(queryParams);
      
    if (result.error) {
      return Promise.reject(new Error(`Failed to fetch ticket events: ${result.error.message}`));
    }
    
    // Map and freeze each event to ensure immutability
    const events = (result.data?.map(item => item.payload) || []).map(deepFreeze);
    return events;
  })();
};

/**
 * Fetches user authentication events (login and token refreshes)
 * Returns a Result with the events or an error
 */
export const fetchAuthEvents = (queryFn) => async (userId) => {
  return fetchEventsByUserAndFilters(queryFn)({
    userId,
    filters: {
      types: ['LOGIN_SUCCEEDED', 'TOKEN_REFRESHED', 'INVALID_REFRESH_TOKEN']
    }
  });
};

/**
 * Fetches recent user activity from the user_activity table
 * Returns a Result with the activity or an error
 */
export const fetchUserActivity = (queryFn) => async (userId, limit = 10) => {
  return tryCatchAsync(async () => {
    const queryParams = {
      table: USER_ACTIVITY_TABLE,
      filters: {
        user_id: userId
      },
      select: '*',
      order: 'created_at',
      limit,
      ascending: false
    };
    
    const result = await queryFn(queryParams);
      
    if (result.error) {
      return Promise.reject(new Error(`Failed to fetch user activity: ${result.error.message}`));
    }
    
    // Freeze the activity data to ensure immutability
    return deepFreeze(result.data || []);
  })();
};

/**
 * Creates a Supabase query function that can be used with our event store functions
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {QueryFn} - Query function that works with our event store
 */
export const createSupabaseQueryFn = (supabaseClient) => async (params) => {
  const { table, filters = {}, select = '*', order, limit, ascending = true } = params;
  
  let query = supabaseClient.from(table).select(select);
  
  // Apply filters
  Object.entries(filters).forEach(([key, value]) => {
    if (key === 'user_id' && value) {
      query = query.eq('user_id', value);
    } else if (key === 'type' && value) {
      query = query.eq('type', value);
    } else if (key === 'types' && Array.isArray(value) && value.length > 0) {
      query = query.in('type', value);
    } else if (key === 'ticketId' && value) {
      query = query.contains('payload', { ticketId: value });
    }
  });
  
  // Apply ordering
  if (order) {
    query = query.order(order, { ascending });
  }
  
  // Apply limit
  if (limit) {
    query = query.limit(limit);
  }
  
  return query;
};

/**
 * Creates a Supabase persist function that can be used with our event store functions
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {PersistFn} - Persist function that works with our event store
 */
export const createSupabasePersistFn = (supabaseClient) => async (table, data) => {
  return supabaseClient.from(table).insert([data]).select();
};
