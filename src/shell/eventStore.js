/**
 * Event store implementation using Supabase
 * Part of the imperative shell that handles side effects
 */
import { v4 as generateUUID } from 'uuid';

// Event store table name
const EVENT_STORE_TABLE = 'event_store';

/**
 * Stores an event in the Supabase event store
 * Pure function that returns a Promise
 */
export const storeEvent = (supabaseClient) => async (event) => {
  const { error } = await supabaseClient
    .from(EVENT_STORE_TABLE)
    .insert([{
      id: generateUUID(),
      user_id: event.userId,
      event_type: event.type,
      event_data: event,
      timestamp: event.timestamp
    }]);
    
  if (error) {
    return Promise.reject(new Error(`Failed to store event: ${error.message}`));
  }
  
  return Promise.resolve(event);
};

/**
 * Fetches all events for a specific user
 * Pure function that returns a Promise
 */
export const fetchEventsForUser = (supabaseClient) => async (userId) => {
  const { data, error } = await supabaseClient
    .from(EVENT_STORE_TABLE)
    .select('event_data')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });
    
  if (error) {
    return Promise.reject(new Error(`Failed to fetch events: ${error.message}`));
  }
  
  return Promise.resolve(data?.map(item => item.event_data) || []);
};

/**
 * Fetches events of a specific type for a user
 * Pure function that returns a Promise
 */
export const fetchEventsByType = (supabaseClient) => async (userId, eventType) => {
  const { data, error } = await supabaseClient
    .from(EVENT_STORE_TABLE)
    .select('event_data')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .order('timestamp', { ascending: true });
    
  if (error) {
    return Promise.reject(new Error(`Failed to fetch events: ${error.message}`));
  }
  
  return Promise.resolve(data?.map(item => item.event_data) || []);
};

/**
 * Fetches events related to a specific ticket
 * Pure function that returns a Promise
 */
export const fetchTicketEvents = (supabaseClient) => async (ticketId) => {
  const { data, error } = await supabaseClient
    .from(EVENT_STORE_TABLE)
    .select('event_data')
    .contains('event_data', { ticketId })
    .order('timestamp', { ascending: true });
    
  if (error) {
    return Promise.reject(new Error(`Failed to fetch ticket events: ${error.message}`));
  }
  
  return Promise.resolve(data?.map(item => item.event_data) || []);
};
