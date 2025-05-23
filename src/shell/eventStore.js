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
    // console.log({ event });
    // Ensure event has a timestamp if not already present
    const eventWithTimestamp = deepFreeze({
      ...event,
      timestamp: event.timestamp || Date.now()
    });

    // Insert into the events table with the new schema
    const eventResult = await persistFn(EVENTS_TABLE, {
      id: generateUUID(),
      email: event.email, // Usar email como identificador de agregado
      type: event.type,
      payload: eventWithTimestamp
    });
    
    // persistFn ahora devuelve un Result, así que necesitamos manejarlo adecuadamente
    if (eventResult.error) {
      throw new Error(`Failed to store event: ${eventResult.unwrapError().message}`);
    }
    
    // For authentication events, also track in user_activity table
    if (
      event.type === 'LOGIN_SUCCEEDED' || 
      event.type === 'TOKEN_REFRESHED' || 
      event.type === 'INVALID_REFRESH_TOKEN'
    ) {
      // Usar un enfoque funcional para manejar el registro de actividad del usuario
      // No esperamos a que se complete, para no bloquear el flujo principal
      persistFn(USER_ACTIVITY_TABLE, {
        email: event.email, // Usar email como identificador de agregado
        activity_type: event.type,
        created_at: eventWithTimestamp.timestamp
      })
      .then(result => {
        if (result.error) {
          console.error(`Failed to store user activity: ${result.unwrapError().message}`);
        } else {
          console.log(`Successfully stored user activity for ${event.type}`);
        }
      })
      .catch(error => {
        console.error(`Exception storing user activity: ${error.message}`);
      });
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
    console.log('Fetching events:', params);
    const { email, filters = {}, select = 'payload', order = 'created_at' } = params;
    
    const queryParams = {
      table: EVENTS_TABLE,
      filters: {
        email, // Usar email como identificador de agregado
        ...filters
      },
      select,
      order
    };

    console.log('Query params:', queryParams);

    const result = await queryFn(queryParams);
      
    if (result.error) {
      throw new Error(`Failed to fetch events: ${result.unwrapError().message}`);
    }
    
    // Map and freeze each event to ensure immutability
    return (result.unwrap() || [])
      .map(item => item.payload)
      .map(deepFreeze);
  })();
};

/**
 * Fetches all events for a specific user
 * Returns a Result with the events or an error
 */
export const fetchEventsForUser = (queryFn) => async (email) => {
  return fetchEventsByUserAndFilters(queryFn)({
    email,
    filters: {}
  });
};

/**
 * Fetches events of a specific type for a user
 * Returns a Result with the events or an error
 */
export const fetchEventsByType = (queryFn) => async (email, eventType) => {
  return fetchEventsByUserAndFilters(queryFn)({
    email,
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
export const fetchAuthEvents = (queryFn) => async (email) => {
  return fetchEventsByUserAndFilters(queryFn)({
    email,
    filters: {
      type: ['LOGIN_SUCCEEDED', 'TOKEN_REFRESHED', 'INVALID_REFRESH_TOKEN']
    }
  });
};

/**
 * Fetches recent user activity from the user_activity table
 * Returns a Result with the activity or an error
 */
export const fetchUserActivity = (queryFn) => async (email) => {
  return tryCatchAsync(async () => {
    const queryParams = {
      table: USER_ACTIVITY_TABLE,
      filters: {
        email // Usar email como identificador de agregado
      },
      select: '*',
      order: 'created_at',
      limit,
      ascending: false
    };
    
    const result = await queryFn(queryParams);
      
    if (result.error) {
      throw new Error(`Failed to fetch user activity: ${result.unwrapError().message}`);
    }
    
    // Map and freeze each activity to ensure immutability
    return (result.unwrap() || []).map(deepFreeze);
  })();
};

/**
 * Creates a Supabase query function that can be used with our event store functions
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {QueryFn} - Query function that works with our event store
 */
export const createSupabaseQueryFn = (supabaseClient) => async (params) => {
  return tryCatchAsync(async () => {
    const { table, filters = {}, select = '*', order, limit, ascending = true } = params;
    
    console.log("Supabase query:", {
      table,
      filters,
      select,
      order,
      limit
    });
    
    // Crear la consulta base
    const baseQuery = supabaseClient.from(table).select(select);
    
    // Aplicar filtros de forma funcional
    const withFilters = Object.entries(filters).reduce((query, [key, value]) => {
      if (key === 'email' && value) {
        return query.eq('email', value);
      } else if (key === 'type' && value) {
        return query.eq('type', value);
      } else if (key === 'types' && Array.isArray(value) && value.length > 0) {
        return query.in('type', value);
      } else if (key === 'ticketId' && value) {
        return query.contains('payload', { ticketId: value });
      }
      return query;
    }, baseQuery);
    
    // Aplicar ordenamiento de forma funcional
    const withOrder = order 
      ? withFilters.order(order, { ascending }) 
      : withFilters;
    
    // Aplicar límite de forma funcional
    const finalQuery = limit 
      ? withOrder.limit(limit) 
      : withOrder;
    
    // Execute the query and handle errors
    const { data, error } = await finalQuery;
    
    if (error) {
      throw new Error(JSON.stringify({
        message: `Database query error: ${error.message}`,
        details: error,
        code: error.code
      }));
    }
    
    return deepFreeze(data);
  })();
};

/**
 * Creates a Supabase persist function that can be used with our event store functions
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {PersistFn} - Persist function that works with our event store
 */
export const createSupabasePersistFn = (supabaseClient) => async (table, data) => {
  return tryCatchAsync(async () => {
    console.log(`Persisting data to table '${table}':`, {
      dataKeys: Object.keys(data),
      tableUsed: table
    });
    
    // Usamos el cliente con la clave de servicio para evitar problemas de RLS
    // Utilizamos la opción de rpc para llamar a funciones almacenadas que tienen permisos elevados
    const { data: insertedData, error } = await supabaseClient
      .from(table)
      .insert([data])
      .select();
    
    if (error) {
      // Manejar errores comunes de forma más descriptiva
      if (error.code === '42501') {
        console.error(`RLS policy violation for table '${table}'. Make sure you're using the service role key.`);
        throw new Error(JSON.stringify({
          message: `Row-level security policy violation for table '${table}'. Using service role can bypass this.`,
          details: error,
          code: error.code
        }));
      } else {
        throw new Error(JSON.stringify({
          message: `Database insert error: ${error.message}`,
          details: error,
          code: error.code
        }));
      }
    }
    
    console.log(`Successfully persisted to '${table}'`);
    return deepFreeze(insertedData?.[0] || null);
  })();
};

// Crear función persistencia específica usando el cliente admin
export const getSupabaseAdminPersistFn = async () => {
  try {
    // Usar import dinámico en lugar de require para módulos ES
    const configModule = await import('./config.js');
    const adminClient = configModule.getSupabaseAdminClient();
    
    if (!adminClient) {
      console.error("❌ No se pudo obtener el cliente admin de Supabase. Asegúrate de que SUPABASE_SERVICE_KEY esté configurado.");
      return null;
    }
    
    return createSupabasePersistFn(adminClient);
  } catch (error) {
    console.error("❌ Error al obtener el cliente admin de Supabase:", error);
    return null;
  }
};
