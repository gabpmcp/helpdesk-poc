/**
 * Handles side-effects based on events
 * Part of the imperative shell
 */
import { getSupabaseAdminClient } from './config.js';
import { v4 as generateUUID } from 'uuid';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { 
  Result, 
  tryCatch, 
  tryCatchAsync, 
  deepFreeze, 
  pipe, 
  pipeAsync,
  extractErrorInfo
} from '../utils/functional.js';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = '1h';  // 1 hour
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

/**
 * @typedef {Object} AuthResult
 * @property {boolean} isAuthenticated
 * @property {string} [userId]
 * @property {Object} [userDetails]
 * @property {string} [reason]
 */

/**
 * @typedef {(email: string, password: string) => Promise<Result<{userId: string, userDetails: Object}, Error>>} AuthenticateFn
 */

/**
 * @typedef {(ticket: Object) => Promise<Result<Object, Error>>} TicketOperationFn
 */

/**
 * @typedef {(comment: Object) => Promise<Result<Object, Error>>} CommentOperationFn
 */

/**
 * @typedef {Object} NotificationDeps
 * @property {Object} supabaseAuth - Supabase authentication functions
 * @property {Function} supabaseAuth.signIn - Function to authenticate users with Supabase
 * @property {Function} supabaseAuth.signUp - Function to register users with Supabase
 * @property {Object} n8nClient - n8n client for external workflow operations
 * @property {Function} n8nClient.verifyZohoContact - Function to verify if a contact exists in Zoho CRM
 * @property {Function} storeEvent - Function to store events
 * @property {TicketOperationFn} createTicket - Function to create tickets
 * @property {TicketOperationFn} updateTicket - Function to update tickets
 * @property {CommentOperationFn} addComment - Function to add comments
 * @property {TicketOperationFn} escalateTicket - Function to escalate tickets
 */

/**
 * Notifies external systems based on event type
 * This is where all side effects happen
 * Returns a Result with the processed event or an error
 * @param {Object} event - Event to process
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
export const notifyExternal = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    // Validate that event has required email field
    if (!event.email) {
      throw new Error('Event is missing required email field');
    }
    
    // Process the event based on its type
    switch (event.type) {
      case 'LOGIN_REQUESTED':
        return await handleLoginRequested(event, deps);
        
      case 'LOGIN_SUCCEEDED':
        return await handleLoginSucceeded(event, deps);
        
      case 'REFRESH_TOKEN_VALIDATED':
        return await handleRefreshTokenValidated(event, deps);
        
      case 'TICKET_CREATED':
        return await handleTicketCreated(event, deps);
        
      case 'TICKET_UPDATED':
        return await handleTicketUpdated(event, deps);
        
      case 'COMMENT_ADDED':
        return await handleCommentAdded(event, deps);
        
      case 'TICKET_ESCALATED':
        return await handleTicketEscalated(event, deps);
        
      case 'USER_REGISTRATION_REQUESTED':
        try {
          console.log(`🔐 Procesando registro de usuario para: ${event.email}`);
          
          // Verificar estructura del evento
          if (!event.email || !event.password) {
            console.error('❌ Error: evento de registro incompleto', JSON.stringify(event));
            
            // Si los datos están anidados en la propiedad data, usamos esos
            if (event.data && event.data.email && event.data.password) {
              console.log('📝 Usando datos desde event.data');
              // Crear una copia del evento con los datos correctos
              event = {
                ...event,
                email: event.data.email,
                password: event.data.password
              };
            } else {
              const incompleteEvent = deepFreeze({
                type: event.type,
                success: false,
                email: event.email || (event.data && event.data.email) || 'unknown',
                message: 'Datos de registro incompletos',
                error: 'Missing required email or password',
                timestamp: new Date().toISOString()
              });
              
              // Persistir el evento de error (sin contraseña)
              if (deps && deps.storeEvent) {
                try {
                  await deps.storeEvent(incompleteEvent);
                  console.log('✅ Evento de error persistido correctamente');
                } catch (storeErr) {
                  console.error('❌ Error al persistir evento de error:', storeErr);
                }
              }
              
              return Result.ok(incompleteEvent);
            }
          }
          
          // Crear una copia del evento con la contraseña encriptada para logs (no para persistencia)
          const eventWithEncryptedPassword = {
            ...event,
            password: encryptPassword(event.password)
          };
          
          // Guardamos la contraseña original para el registro en Supabase
          const originalPassword = event.password;
          
          // Importamos el servicio de registro actualizado
          console.log('📦 Importando servicio de registro...');
          const registrationService = await import('../services/registrationService.js');
          
          console.log('🔍 Validando contacto en Zoho CRM para:', event.email);
          
          try {
            // Primero validamos el contacto en Zoho CRM
            const contactData = await registrationService.validateZohoContact(event.email);
            
            console.log('✅ Contacto validado en Zoho CRM:', {
              email: contactData.email,
              fullName: contactData.fullName,
              zoho_contact_id: contactData.zoho_contact_id,
              zoho_account_id: contactData.zoho_account_id
            });
            
            // Persistir el evento de validación exitosa (sin contraseña)
            const validationEvent = deepFreeze({
              type: 'CONTACT_VERIFICATION_SUCCEEDED',
              success: true,
              email: event.email,
              zoho_contact_id: contactData.zoho_contact_id,
              zoho_account_id: contactData.zoho_account_id,
              fullName: contactData.fullName,
              companyName: contactData.companyName,
              timestamp: new Date().toISOString()
            });
            
            if (deps && deps.storeEvent) {
              try {
                // Persistimos el evento sin la contraseña
                await deps.storeEvent(validationEvent);
                console.log('✅ Evento de validación persistido correctamente');
              } catch (storeErr) {
                console.error('❌ Error al persistir evento de validación:', storeErr);
              }
            }
            
            // Si llegamos aquí, el contacto existe en Zoho CRM, procedemos con el registro
            console.log('🔑 Registrando usuario en Supabase...');
            // Usamos la contraseña original (sin encriptar) para el registro
            const result = await registrationService.registerUser(eventWithEncryptedPassword.email, originalPassword);
            
            console.log('✅ Registro completado exitosamente:', {
              email: result.email,
              user_id: result.user_id,
              zoho_contact_id: result.zoho_contact_id
            });
            
            // Formamos la respuesta con los datos devueltos
            const successEvent = deepFreeze({
              type: 'REGISTRATION_SUCCEEDED',
              success: true,
              email: result.email,
              message: 'Registro exitoso. Ahora puedes iniciar sesión.',
              zoho_contact_id: result.zoho_contact_id,
              zoho_account_id: result.zoho_account_id,
              user_id: result.user_id,
              timestamp: new Date().toISOString()
            });
            
            // Persistir el evento de éxito (sin contraseña)
            if (deps && deps.storeEvent) {
              try {
                // Persistimos el evento sin la contraseña
                await deps.storeEvent(successEvent);
                console.log('✅ Evento de éxito persistido correctamente');
              } catch (storeErr) {
                console.error('❌ Error al persistir evento de éxito:', storeErr);
              }
            }
            
            return Result.ok(successEvent);
          } catch (validationError) {
            console.error('❌ Error en validación de contacto:', validationError);
            
            // Preparamos un mensaje amigable para el usuario basado en el tipo de error
            let userMessage = 'Error en el registro. Por favor intente nuevamente.';
            let errorType = 'REGISTRATION_ERROR';
            
            // Si es un error específico de validación en Zoho, personalizamos el mensaje
            if (validationError.message && (
                validationError.message.includes('not registered') || 
                validationError.message.includes('Zoho CRM'))) {
              userMessage = 'El correo electrónico no está registrado como contacto en nuestro sistema.';
              errorType = 'CONTACT_VERIFICATION_FAILED';
            } else if (validationError.message && validationError.message.includes('Network error')) {
              userMessage = 'Error de conexión al validar el contacto. Por favor intente más tarde.';
              errorType = 'NETWORK_ERROR';
            }
            
            const errorEvent = deepFreeze({
              type: errorType,
              success: false,
              email: eventWithEncryptedPassword.email,
              message: userMessage,
              error: validationError.message || 'Unknown error',
              stack: validationError.stack,
              timestamp: new Date().toISOString()
            });
            
            // Persistir el evento de error (sin contraseña)
            if (deps && deps.storeEvent) {
              try {
                // Persistimos el evento sin la contraseña
                await deps.storeEvent(errorEvent);
                console.log('✅ Evento de error persistido correctamente');
              } catch (storeErr) {
                console.error('❌ Error al persistir evento de error:', storeErr);
              }
            }
            
            return Result.ok(errorEvent);
          }
        } catch (error) {
          console.error('❌ Error general en registro de usuario:', error);
          
          // Preparamos un mensaje amigable para el usuario
          let userMessage = 'Error en el registro. Por favor intente nuevamente.';
          
          // Si es un error específico de validación en Zoho, personalizamos el mensaje
          if (error.message && (
              error.message.includes('not registered') || 
              error.message.includes('Zoho CRM'))) {
            userMessage = 'El correo electrónico no está registrado como contacto en nuestro sistema.';
          }
          
          const generalErrorEvent = deepFreeze({
            type: 'REGISTRATION_FAILED',
            success: false,
            email: eventWithEncryptedPassword.email,
            message: userMessage,
            error: error.message || 'Unknown error',
            stack: error.stack,
            timestamp: new Date().toISOString()
          });
          
          // Persistir el evento de error general (sin contraseña)
          if (deps && deps.storeEvent) {
            try {
              // Persistimos el evento sin la contraseña
              await deps.storeEvent(generalErrorEvent);
              console.log('✅ Evento de error general persistido correctamente');
            } catch (storeErr) {
              console.error('❌ Error al persistir evento de error general:', storeErr);
            }
          }
          
          return Result.ok(generalErrorEvent);
        }
        
      default:
        // For events that don't require external notification, return as is
        return deepFreeze(event);
    }
  })();
};

/**
 * Verifies if a contact exists in Zoho CRM via n8n
 * @param {Object} n8nClient - n8n client for external workflow operations
 * @returns {Function} - Function that takes an email and returns a Result
 */
export const verifyZohoContact = (n8nClient) => async (email) => {
  console.log('[N8N] Verifying contact in Zoho CRM:', email);
  
  if (!n8nClient || typeof n8nClient.verifyZohoContact !== 'function') {
    console.error('[N8N] n8n client not available');
    return Result.error(new Error(JSON.stringify({
      status: 503,
      message: 'Zoho CRM verification service not available',
      details: { errorCode: 'N8N_NOT_CONFIGURED', message: 'Zoho CRM verification service not available' }
    })));
  }
  
  try {
    // Call the n8n client to verify the contact
    const result = await n8nClient.verifyZohoContact(email);
    
    if (result.isError) {
      return result;
    }
    
    const contactData = result.unwrap();
    console.log('[N8N] Contact verified successfully via n8n:', contactData);
    
    // Asegurar que la respuesta tenga la estructura esperada
    if (!contactData || !contactData.contact) {
      console.error('[N8N] Invalid contact data returned from n8n');
      return Result.error(new Error(JSON.stringify({
        status: 400,
        message: 'Invalid contact data returned from Zoho CRM',
        details: { errorCode: 'INVALID_CONTACT_DATA', message: 'Invalid contact data structure' }
      })));
    }
    
    // Devolver un objeto inmutable con la estructura esperada
    return Result.ok(deepFreeze({
      contact: contactData.contact,
      payload: contactData.payload || {}
    }));
  } catch (error) {
    console.error('[N8N] Exception verifying contact via n8n:', error);
    return Result.error(error);
  }
};

/**
 * Checks if a user exists in Supabase
 * @param {Object} supabaseClient - Supabase client
 * @returns {Function} - Function that takes an email and returns a Result
 */
export const checkSupabaseUser = (supabaseClient) => (email) =>
  Promise.resolve(email)
    .then(logChecking)
    .then(assertSupabaseAdminAvailable(supabaseClient))
    .then(fetchUser(supabaseClient))
    .then((user) => {
      logUserFoundOrNull(user);
      return user;
    })
    // .then(formatUserResult)
    .catch(handleSupabaseError);

const logChecking = (email) => {
  console.log('[SUPABASE] Checking user exists:', email);
  return email;
};

const assertSupabaseAdminAvailable = (client) => (email) => {
  if (!client?.auth?.admin?.listUsers) {
    return Promise.reject(serviceUnavailableError());
  }
  return Promise.resolve(email);
};

const fetchUser = (client) => (email) =>
  client.auth.admin
    .listUsers({ page: 1, perPage: 1, email })
    .then(({ data: { users }, error }) =>
      error ? Promise.reject(supabaseError(error)) : users.find((u) => u.email === email) ?? null
    );

const logUserFoundOrNull = (user) => {
  console.log(
    `[SUPABASE] ${user ? `User found: ${user.email}` : 'User not found'}`
  );
};

// const formatUserResult = (user) =>
//   user?.exists ? { email: user.email, exists: true } : null;

const serviceUnavailableError = (context) =>
  new Error(
    JSON.stringify({
      status: 503,
      message: `${context} not available`,
      details: {
        errorCode: `${context.toUpperCase().replace(/\s+/g, '_')}_NOT_CONFIGURED`,
        message: `${context} not available`,
      },
    })
  );

const supabaseError = (error, defaultMessage = 'Supabase error', defaultStatus = 500) =>
  new Error(
    JSON.stringify({
      status: error.status || defaultStatus,
      message: error.message || defaultMessage,
      details: {
        errorCode: error.code || 'UNKNOWN_ERROR',
        message: error.message || defaultMessage,
      },
    })
  );

const handleSupabaseError = (err) => {
  console.error('[SUPABASE] Error checking user:', err);
  throw err;
};

const markUserAsVerified = (user) =>
  pipeAsync(
    () => Promise.resolve(getSupabaseAdminClient()),
    (client) =>
      client
        ? client.auth.admin
            .updateUserById(user.id, { email_confirm: true })
            .then(({ error }) =>
              error ? Promise.reject(supabaseError(error)) : user
            )
        : Promise.resolve(user)
  )();

export const loginUser = ({ supabaseUrl, supabaseAnonKey }) => (email, password) =>
  Promise.resolve({ email, password })
    .then(assertValidCredentials)
    .then(attemptLogin(supabaseUrl, supabaseAnonKey))
    .then(toLoginResult)
    .catch((err) => Promise.reject(parseError(err, 'LOGIN_FAILED')));

const assertValidCredentials = ({ email, password }) =>
  typeof email === 'string' && typeof password === 'string'
    ? { email, password }
    : Promise.reject(
        new Error(
          JSON.stringify({
            status: 400,
            message: 'Email and password must be strings',
            details: { errorCode: 'INVALID_INPUT' }
          })
        )
      );
  
const toLoginResult = ({ access_token, user, expires_in, refresh_token }) =>
  deepFreeze({
    session: { access_token, expires_in, refresh_token },
    user: user || null
  });

const attemptLogin = (supabaseUrl, supabaseAnonKey) => ({ email, password }) =>
  fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    },
    body: JSON.stringify({
      email,
      password
    })
  }).then((res) =>
    res
      .json()
      .catch(() => ({}))
      .then((json) =>
        { console.log({json}); console.log({res}); return res.ok
        ? json
        : Promise.reject(
            Object.assign(new Error(json || 'Supabase login failed'), {
              code: json.error_code || res.status,
              status: res.status,
              details: json
            })
          )}
      )
  );

const validateLoginResponse = ({ data, error, email }) =>
  error
    ? Promise.reject(
        new Error(
          JSON.stringify({
            status: error.status || 401,
            message: error.message || 'Authentication failed',
            details: { errorCode: error.code, message: error.message }
          })
        )
      )
    : data?.user
    ? { user: data.user, session: data.session }
    : Promise.reject(
        new Error(
          JSON.stringify({
            status: 401,
            message: 'Authentication failed - no user data',
            details: { errorCode: 'NO_USER_DATA', message: 'No user data returned from authentication' }
          })
        )
      );

const buildLoginResult = ({ user, session }) =>
  deepFreeze({
    userId: user.id,
    email: user.email,
    userDetails: user,
    session
  });

const logRegisterAttempt = ({ email }) =>
  console.log('[SUPABASE] Attempting to register user:', email);

const assertSignUpAvailable = (auth) => (input) => {
  if (!auth?.signUp || typeof auth.signUp !== 'function') {
    return Promise.reject(serviceUnavailableError());
  }
  return input;
};

// const signUpWithSupabase = (auth) => ({ email, password }) => {
//   const payload = { email, password };
//   console.log('[DEBUG] Payload typeof:', typeof payload);
//   console.log('[DEBUG] Payload JSON:', JSON.stringify(payload));
//   console.log('[DEBUG] Payload keys:', Object.keys(payload));
//   console.log('[DEBUG] Payload:', payload);
//   if (typeof email !== 'string' || typeof password !== 'string') {
//     throw new Error(`Invalid input to Supabase: email and password must be strings. Got: ${typeof email}, ${typeof password}`);
//   }
//   return auth.signUp(payload).then(({ data, error }) =>
//     error ? Promise.reject(supabaseError(error)) : data
//   );
// };

const signUpWithSupabase = ({ supabaseUrl, supabaseAnonKey }) => ({ email, password }) =>
  Promise.resolve({ email, password })
    .then(assertValidCredentials)
    .then(toPayload)
    .then(postSignUpRequest(supabaseUrl, supabaseAnonKey))

const toPayload = ({ email, password }) => ({
  url: '/auth/v1/signup',
  body: { email, password, email_confirm: true },
  // debug: { email, password }
});

const postSignUpRequest = (supabaseUrl, supabaseAnonKey) =>
  ({ url, body, debug = false }) => {
    console.log({ supabaseUrl, supabaseAnonKey, url, body}); 
    return typeof body !== 'object'
      ? Promise.reject(new Error('Body must be a plain object'))
      : fetch(`${supabaseUrl}${url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`
          },
          body: JSON.stringify(body)
        })
          .then(async (res) => {
            const json = await res.json();
            if (debug) console.log('[Signup Response]', json);
            return res.ok
              ? json
              : Promise.reject(
                  Object.assign(
                    new Error(json.error?.message || 'Unknown Supabase signup error'),
                    {
                      code: json.error?.code || res.status,
                      status: res.status,
                      details: json
                    }
                  )
                );
          });
        }

const validateSignUpResponse = (data) => {
  // console.log({ data });
  if (!data || !data.email) {
    return Promise.reject(
      new Error(
        JSON.stringify({
          status: 400,
          message: 'Registration failed - no user data',
          details: {
            errorCode: 'NO_USER_DATA',
            message: 'No user data returned from registration',
          },
        })
      )
    );
  }
  return data;
};

const formatRegisterData = (data) => ({
  userId: data.id,
  email: data.email,
  userDetails: data.user_metadata,
  session: data.session,
});

const logRegisterSuccess = (data) =>
  console.log('[SUPABASE] Registration successful:', data);

const parseError = (err, defaultCode) => {
  const parsed = safeJsonParse(err?.message);
  return parsed
    ? {
        reason: parsed.message || 'Process failed',
        errorCode: parsed.details?.errorCode || defaultCode,
        errorDetails: parsed.details,
      }
    : {
        reason: 'Unexpected error',
        errorCode: defaultCode,
        errorDetails: extractErrorInfo(err),
      };
};

const safeJsonParse = (value) => {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * Registers a new user in Supabase
 * @param {Object} supabaseAuth - Supabase authentication functions
 * @returns {Function} - Function that takes an email and password and returns a Result
 */
export const registerSupabaseUser = (supabaseAuth) => async (email, password) => {
  console.log('Registering user in Supabase:', email);
  
  if (!supabaseAuth || typeof supabaseAuth.signUp !== 'function') {
    console.error('Supabase auth not available');
    return Result.error(new Error('Supabase authentication service not available'));
  }
  
  try {
    // Obtener el contacto de Zoho CRM primero para validar
    const zohoService = await import('../services/registrationService.js');
    
    // Validar que el contacto existe en Zoho CRM
    const contactResult = await zohoService.validateContactInZoho(email);
    
    if (!contactResult.isOk) {
      return Result.error(new Error(
        `Email not found in Zoho CRM or validation failed: ${contactResult.unwrapError()}`
      ));
    }
    
    // Extraer los datos del contacto
    const contactData = contactResult.unwrap();
    
    // Registrar en Supabase con los datos del contacto de Zoho
    const { data, error } = await supabaseAuth.signUp({
      email,
      password,
      options: {
        data: {
          zoho_contact_id: contactData.zoho_contact_id,
          zoho_account_id: contactData.zoho_account_id,
          full_name: contactData.full_name
        }
      }
    });
    
    if (error) {
      return Result.error(new Error(`Registration failed: ${error.message}`));
    }
    
    if (!data || !data.user) {
      return Result.error(new Error('Registration failed: No user data returned'));
    }
    
    // Devolver los datos del usuario registrado
    return Result.ok({
      userId: data.user.id,
      email: data.user.email
    });
  } catch (error) {
    console.error('Exception registering user:', error);
    return Result.error(new Error(`Registration error: ${error.message}`));
  }
};

/**
 * Handles login request events
 * @param {Object} event - Login request event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 * @returns {Promise<r>} - Result containing the login event
 */
const handleLoginRequested = (event, deps) =>
  Promise.resolve(event)
    .then(tap(logStart))
    .then(assertSupabaseAvailable(deps))
    .then(authenticateWithSupabase(deps))
    .catch(handleUnhandled(event, deps));

// Función auxiliar tap para ejecutar una función y devolver el valor original
const tap = (fn) => (val) => {
  fn(val);
  return val;
};

const logStart = ({ email }) =>
  console.log(`[LOGIN] Processing login request for: ${email}`);

const assertSupabaseAvailable = (deps) => (event) => {
  if (!deps?.supabaseAuth) {
    console.error('[LOGIN] Supabase authentication service not available');
    return Promise.reject({
      reason: 'Authentication service not available',
      errorCode: 'SERVICE_UNAVAILABLE',
      email: event.email // Preserve email for error handling
    });
  }
  return event;
};

const handleUnhandled = (event, deps) => (error) => {
  console.error('[LOGIN] Unhandled exception in handleLoginRequested:', error);
  const authResult = {
    isAuthenticated: false,
    reason: error.reason || 'Internal server error',
    errorCode: error.errorCode || 'INTERNAL_ERROR',
    errorDetails: error.errorDetails || extractErrorInfo(error),
  };
  return handleFailedLogin(event, authResult, deps);
};

const authenticateWithSupabase = (deps) => async (event) => {
  console.log('[SUPABASE] Authenticating user with Supabase:', event.email);
  
  try {
    // Importar la función confirmUserEmail y getSupabaseAdminClient
    const { confirmUserEmail } = await import('../services/registrationService.js');
    const { getSupabaseAdminClient } = await import('./config.js');
    
    // Obtener el cliente admin de Supabase
    const adminClient = getSupabaseAdminClient();
    
    if (!adminClient) {
      console.error('[SUPABASE] Admin client not available');
      throw new Error('Admin client not available');
    }
    
    // Buscar el usuario por email usando la API admin
    const { data: { users = [] }, error: listError } = await adminClient.auth.admin.listUsers({
      filters: {
        email: event.email
      }
    });
    
    if (listError) {
      console.error('[SUPABASE] Error listing users:', listError);
      throw listError;
    }
    
    const user = users.find(u => u.email === event.email);
    
    if (user && user.id) {
      console.log('[SUPABASE] Found user ID:', user.id);
      
      // Intentar confirmar el email
      const confirmed = await confirmUserEmail(user.id, event.email);
      
      if (confirmed) {
        console.log('[SUPABASE] Email confirmed successfully, retrying login...');
        
        // Reintentar el login directamente con Supabase
        try {
          // Crear un cliente de Supabase con la clave anónima para simular login del usuario
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
          );
          
          // Realizar login directamente
          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: event.email,
            password: event.password
          });
          
          if (error) {
            console.error('[SUPABASE] Direct retry authentication error:', error);
            return Promise.reject({
              reason: 'Invalid credentials',
              errorCode: 'INVALID_CREDENTIALS',
              errorDetails: error
            });
          }
          
          if (!data || !data.user) {
            console.error('[SUPABASE] No user data returned on direct retry');
            return Promise.reject({
              reason: 'Authentication failed',
              errorCode: 'AUTH_FAILED',
              errorDetails: { message: 'No user data returned from authentication service on direct retry' }
            });
          }
          
          console.log('[SUPABASE] Authentication successful for user on direct retry:', data.user.id);
          
          // Crear evento LOGIN_SUCCEEDED
          const loginSucceededEvent = deepFreeze({
            type: 'LOGIN_SUCCEEDED',
            userId: data.user.id,
            email: data.user.email,
            userDetails: data.user,
            session: data.session,
            timestamp: event.timestamp || new Date().toISOString()
          });
          
          // Almacenar el evento de inicio de sesión exitoso
          if (deps && deps.storeEvent) {
            try {
              await deps.storeEvent(loginSucceededEvent);
              console.log('[LOGIN] LOGIN_SUCCEEDED event stored successfully');
            } catch (storeErr) {
              console.error('[LOGIN] Failed to store LOGIN_SUCCEEDED event:', storeErr);
            }
          }
          
          return loginSucceededEvent;
        } catch (error) {
          console.error('[SUPABASE] Unexpected error during direct retry authentication:', error);
          return Promise.reject({
            reason: 'Authentication failed',
            errorCode: 'AUTH_FAILED',
            errorDetails: extractErrorInfo(error)
          });
        }
      }
    } else {
      console.error('[SUPABASE] Could not find user ID for email:', event.email);
    }
    
    // Usar Supabase Auth para iniciar sesión
    const result = await deps.supabaseAuth.signIn(event.email, event.password);
    
    if (result.isError) {
      const error = result.unwrapError();
      console.error('[SUPABASE] Authentication error:', error);
      
      // Verificar si el error es "email_not_confirmed"
      if (error && (error.code === 'email_not_confirmed' || (error.details && error.details.errorCode === 'email_not_confirmed'))) {
        console.log('[SUPABASE] Email not confirmed, attempting to confirm it manually...');
        
        try {
          // Importar la función confirmUserEmail
          const { confirmUserEmail } = await import('../services/registrationService.js');
          
          // Obtener el ID del usuario
          const { data: userData } = await deps.supabaseClient
            .from('users')
            .select('id')
            .eq('email', event.email)
            .single();
          
          if (userData && userData.id) {
            console.log('[SUPABASE] Found user ID:', userData.id);
            
            // Intentar confirmar el email
            const confirmed = await confirmUserEmail(userData.id, event.email);
            
            if (confirmed) {
              console.log('[SUPABASE] Email confirmed successfully, retrying login...');
              
              // Reintentar el login directamente con Supabase
              try {
                // Crear un cliente de Supabase con la clave anónima para simular login del usuario
                const { createClient } = await import('@supabase/supabase-js');
                const supabaseClient = createClient(
                  process.env.SUPABASE_URL,
                  process.env.SUPABASE_ANON_KEY
                );
                
                // Realizar login directamente
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                  email: event.email,
                  password: event.password
                });
                
                if (error) {
                  console.error('[SUPABASE] Direct retry authentication error:', error);
                  return Promise.reject({
                    reason: 'Invalid credentials',
                    errorCode: 'INVALID_CREDENTIALS',
                    errorDetails: error
                  });
                }
                
                if (!data || !data.user) {
                  console.error('[SUPABASE] No user data returned on direct retry');
                  return Promise.reject({
                    reason: 'Authentication failed',
                    errorCode: 'AUTH_FAILED',
                    errorDetails: { message: 'No user data returned from authentication service on direct retry' }
                  });
                }
                
                console.log('[SUPABASE] Authentication successful for user on direct retry:', data.user.id);
                
                // Crear evento LOGIN_SUCCEEDED
                const loginSucceededEvent = deepFreeze({
                  type: 'LOGIN_SUCCEEDED',
                  userId: data.user.id,
                  email: data.user.email,
                  userDetails: data.user,
                  session: data.session,
                  timestamp: event.timestamp || new Date().toISOString()
                });
                
                // Almacenar el evento de inicio de sesión exitoso
                if (deps && deps.storeEvent) {
                  try {
                    await deps.storeEvent(loginSucceededEvent);
                    console.log('[LOGIN] LOGIN_SUCCEEDED event stored successfully');
                  } catch (storeErr) {
                    console.error('[LOGIN] Failed to store LOGIN_SUCCEEDED event:', storeErr);
                  }
                }
                
                return loginSucceededEvent;
              } catch (error) {
                console.error('[SUPABASE] Unexpected error during direct retry authentication:', error);
                return Promise.reject({
                  reason: 'Authentication failed',
                  errorCode: 'AUTH_FAILED',
                  errorDetails: extractErrorInfo(error)
                });
              }
            }
          } else {
            console.error('[SUPABASE] Could not find user ID for email:', event.email);
          }
        } catch (confirmError) {
          console.error('[SUPABASE] Error confirming email:', confirmError);
        }
      }
      
      return Promise.reject({
        reason: 'Invalid credentials',
        errorCode: 'INVALID_CREDENTIALS',
        errorDetails: error
      });
    }
    
    const userData = result;
    
    if (!userData || !userData.userId) {
      console.error('[SUPABASE] No user data returned');
      return Promise.reject({
        reason: 'Authentication failed',
        errorCode: 'AUTH_FAILED',
        errorDetails: { message: 'No user data returned from authentication service' }
      });
    }
    
    console.log('[SUPABASE] Authentication successful for user:', userData.userId);
    
    // Crear evento LOGIN_SUCCEEDED
    const loginSucceededEvent = deepFreeze({
      type: 'LOGIN_SUCCEEDED',
      userId: userData.userId,
      email: userData.email,
      userDetails: userData.userDetails,
      session: userData.session,
      timestamp: event.timestamp || new Date().toISOString()
    });
    
    // Almacenar el evento de inicio de sesión exitoso
    if (deps && deps.storeEvent) {
      try {
        await deps.storeEvent(loginSucceededEvent);
        console.log('[LOGIN] LOGIN_SUCCEEDED event stored successfully');
      } catch (storeErr) {
        console.error('[LOGIN] Failed to store LOGIN_SUCCEEDED event:', storeErr);
      }
    }
    
    return loginSucceededEvent;
  } catch (error) {
    console.error('[SUPABASE] Unexpected error during authentication:', error);
    
    // Verificar si el error es "email_not_confirmed" también aquí
    if (error && (error.code === 'email_not_confirmed' || 
        (error.details && error.details.errorCode === 'email_not_confirmed') ||
        (error.message && error.message.includes('Email not confirmed')))) {
      
      console.log('[SUPABASE] Email not confirmed (catch block), attempting to confirm it manually...');
      
      try {
        // Importar la función confirmUserEmail
        const { confirmUserEmail } = await import('../services/registrationService.js');
        
        // Obtener el ID del usuario
        const { data: userData } = await deps.supabaseClient
          .from('users')
          .select('id')
          .eq('email', event.email)
          .single();
        
        if (userData && userData.id) {
          console.log('[SUPABASE] Found user ID:', userData.id);
          
          // Intentar confirmar el email
          const confirmed = await confirmUserEmail(userData.id, event.email);
          
          if (confirmed) {
            console.log('[SUPABASE] Email confirmed successfully, retrying login...');
            
            // Reintentar el login directamente con Supabase
            try {
              // Crear un cliente de Supabase con la clave anónima para simular login del usuario
              const { createClient } = await import('@supabase/supabase-js');
              const supabaseClient = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_ANON_KEY
              );
              
              // Realizar login directamente
              const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: event.email,
                password: event.password
              });
              
              if (error) {
                console.error('[SUPABASE] Direct retry authentication error:', error);
                return Promise.reject({
                  reason: 'Invalid credentials',
                  errorCode: 'INVALID_CREDENTIALS',
                  errorDetails: error
                });
              }
              
              if (!data || !data.user) {
                console.error('[SUPABASE] No user data returned on direct retry');
                return Promise.reject({
                  reason: 'Authentication failed',
                  errorCode: 'AUTH_FAILED',
                  errorDetails: { message: 'No user data returned from authentication service on direct retry' }
                });
              }
              
              console.log('[SUPABASE] Authentication successful for user on direct retry:', data.user.id);
              
              // Crear evento LOGIN_SUCCEEDED
              const loginSucceededEvent = deepFreeze({
                type: 'LOGIN_SUCCEEDED',
                userId: data.user.id,
                email: data.user.email,
                userDetails: data.user,
                session: data.session,
                timestamp: event.timestamp || new Date().toISOString()
              });
              
              // Almacenar el evento de inicio de sesión exitoso
              if (deps && deps.storeEvent) {
                try {
                  await deps.storeEvent(loginSucceededEvent);
                  console.log('[LOGIN] LOGIN_SUCCEEDED event stored successfully');
                } catch (storeErr) {
                  console.error('[LOGIN] Failed to store LOGIN_SUCCEEDED event:', storeErr);
                }
              }
              
              return loginSucceededEvent;
            } catch (error) {
              console.error('[SUPABASE] Unexpected error during direct retry authentication:', error);
              return Promise.reject({
                reason: 'Authentication failed',
                errorCode: 'AUTH_FAILED',
                errorDetails: extractErrorInfo(error)
              });
            }
          }
        } else {
          console.error('[SUPABASE] Could not find user ID for email:', event.email);
        }
      } catch (confirmError) {
        console.error('[SUPABASE] Error confirming email:', confirmError);
      }
    }
    
    return Promise.reject({
      reason: 'Authentication failed',
      errorCode: 'AUTH_FAILED',
      errorDetails: extractErrorInfo(error)
    });
  }
};

/**
 * Handles a failed login attempt
 * @param {Object} event - Original login request event
 * @param {Object} authResult - Authentication result
 * @param {NotificationDeps} deps - Dependencies for notification operations
 * @returns {Promise<r>} - Result containing the LOGIN_FAILED event
 */
const handleFailedLogin = async (event, authResult, deps) => {
  // Usar tryCatchAsync para manejar errores funcionalmente
  return tryCatchAsync(async () => {
    console.log('[LOGIN] Login failed for user:', event.email);
    console.log('[LOGIN] Failure reason:', authResult.reason);
    
    // Crear evento LOGIN_FAILED (patrón inmutable)
    const loginFailedEvent = deepFreeze({
      type: 'LOGIN_FAILED',
      userId: event.userId,
      email: event.email,
      reason: authResult.reason,
      errorCode: authResult.errorCode,
      errorDetails: authResult.errorDetails,
      stackTrace: authResult.stackTrace,
      timestamp: event.timestamp
    });
    
    console.log('[LOGIN] Created LOGIN_FAILED event');
    
    // Almacenar el evento de inicio de sesión fallido
    const storeResult = await deps.storeEvent(loginFailedEvent);
    
    if (storeResult.isError) {
      console.error('[LOGIN] Failed to store LOGIN_FAILED event:', storeResult.unwrapError());
      return Result.error(new Error(`Failed to store LOGIN_FAILED event: ${storeResult.unwrapError().message}`));
    }
    
    return Result.ok(loginFailedEvent);
  })().catch(error => {
    console.error('[LOGIN] Exception in handleFailedLogin:', error);
    // En caso de error, devolver un evento de error genérico
    return Result.ok(deepFreeze({
      type: 'LOGIN_FAILED',
      userId: event.userId,
      email: event.email,
      reason: 'Internal server error',
      errorCode: 'INTERNAL_ERROR',
      timestamp: event.timestamp
    }));
  });
};

/**
 * Handles a successful login attempt
 * @param {Object} event - Original login request event
 * @param {Object} authResult - Authentication result
 * @param {NotificationDeps} deps - Dependencies for notification operations
 * @returns {Promise<r>} - Result containing the LOGIN_SUCCEEDED event with tokens
 */
const handleSuccessfulLogin = async (event, authResult, deps) => {
  // Crear evento LOGIN_SUCCEEDED (patrón inmutable)
  const loginSucceededEvent = deepFreeze({
    type: 'LOGIN_SUCCEEDED',
    userId: event.userId,
    email: event.email,
    zohoUserId: authResult.userId,
    userDetails: authResult.userDetails,
    companies: authResult.companies || [],
    timestamp: event.timestamp
  });
  
  console.log('Login succeeded, storing event');
  
  try {
    // Almacenar el evento de inicio de sesión exitoso
    const storeResult = await deps.storeEvent(loginSucceededEvent);
    
    if (storeResult.isError) {
      console.error('Failed to store LOGIN_SUCCEEDED event:', storeResult.unwrapError());
      return Result.error(new Error(`Failed to store LOGIN_SUCCEEDED event: ${storeResult.unwrapError().message}`));
    }
    
    // Generar tokens para el evento de inicio de sesión exitoso
    console.log('Generating tokens for successful login');
    return await handleLoginSucceeded(loginSucceededEvent, deps);
  } catch (error) {
    console.error('Exception storing LOGIN_SUCCEEDED event:', error);
    return Result.error(new Error(`Exception storing LOGIN_SUCCEEDED event: ${error.message}`));
  }
};

/**
 * Verifies user credentials
 * Returns a Result with authentication result with user ID if successful
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {NotificationDeps} deps - Dependencies for notification operations
 * @returns {Promise<r>} - Result containing authentication result
 */
const verifyCredentials = async (email, password, deps) => {
  console.log('[AUTH] Authenticating user:', email);
  
  // Verificar si estamos en modo de simulación forzada
  const isForcedMockMode = process.env.FORCE_MOCK_AUTH === 'true';
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const isMockAuth = process.env.MOCK_AUTH === 'true';
  
  // Credenciales válidas para modo de simulación
  const validMockCredentials = [
    { email: 'admin@example.com', password: 'admin123' },
    { email: 'user@example.com', password: 'user123' },
    { email: 'itadmin@advancio.com', password: 'password123' }
  ];
  
  // Si estamos en modo de simulación forzada, verificar credenciales contra la lista de credenciales válidas
  if (isForcedMockMode || (!deps.supabaseAuth && (isDevelopment || isMockAuth))) {
    console.log('[AUTH] Using mock authentication mode');
    
    // Verificar si las credenciales son válidas
    const isValidCredential = validMockCredentials.some(
      cred => cred.email === email && cred.password === password
    );
    
    if (!isValidCredential) {
      console.error('[AUTH] Invalid mock credentials');
      throw new Error(JSON.stringify({
        status: 401,
        message: 'Invalid login credentials',
        details: { 
          errorCode: 'invalid_credentials', 
          message: 'Invalid login credentials'
        }
      }));
    }
    
    console.log('[AUTH] Mock authentication successful');
    return Result.ok({
      isAuthenticated: true,
      email,
      userDetails: {
        id: email,
        email,
        name: email.split('@')[0],
        role: email.includes('admin') ? 'admin' : 'user'
      },
      companies: [
        { id: 'mock-company-1', name: 'Mock Company 1' },
        { id: 'mock-company-2', name: 'Mock Company 2' }
      ],
      session: { token: 'mock-session-token' }
    });
  }
  
  // 1. Verificar disponibilidad del servicio de autenticación
  const checkAuthService = () => {
    if (!deps || !deps.supabaseAuth || typeof deps.supabaseAuth.signIn !== 'function') {
      console.error('[AUTH] Supabase authentication service not available');
      return Result.ok({
        isAuthenticated: false,
        reason: 'Authentication service not available',
        errorCode: 'SERVICE_UNAVAILABLE'
      });
    }
    return null; // Continuar con el pipeline
  };
  
  // 2. Preparar los datos de autenticación
  const prepareAuthData = () => {
    console.log('[AUTH] Preparing authentication data');
    return { email, password };
  };
  
  // 3. Autenticar con Supabase
  const authenticateWithSupabase = async (authData) => {
    if (!authData) return null; // Si hay un error previo, pasar al siguiente paso
    
    try {
      console.log('[SUPABASE] Authenticating user with Supabase:', authData.email);
      const result = await deps.supabaseAuth.signIn(authData.email, authData.password);
      
      // Si result es un Result con error, lanzar el error para que sea manejado
      if (result.isError) {
        console.error('[SUPABASE] Authentication error in Result:', result.unwrapError());
        throw result.unwrapError();
      }
      
      console.log('[SUPABASE] Authentication result:', result);
      
      // Verificar que el resultado tenga los datos necesarios
      if (!result || !result.userId) {
        console.error('[SUPABASE] Invalid authentication result format');
        throw new Error(JSON.stringify({
          status: 401,
          message: 'Authentication failed - invalid result format',
          details: { 
            errorCode: 'INVALID_RESULT_FORMAT', 
            message: 'Authentication service returned an invalid result format'
          }
        }));
      }
      
      return result;
    } catch (error) {
      console.error('[SUPABASE] Authentication error:', error);
      // Propagar el error para que sea manejado por handleAuthError
      throw error;
    }
  };
  
  // 4. Verificar si el usuario existe en Zoho CRM
  const verifyUserInZoho = async (supabaseResult) => {
    if (!supabaseResult) {
      console.log('[ZOHO] Skipping Zoho verification - authentication failed in previous step');
      return null; // Si hay un error previo, pasar al siguiente paso
    }
    
    // Verificar que tengamos el email necesario para la verificación en Zoho
    if (!supabaseResult.email) {
      console.error('[ZOHO] Cannot verify user in Zoho - missing email');
      throw new Error(JSON.stringify({
        status: 400,
        message: 'Cannot verify user in Zoho - missing email',
        details: { 
          errorCode: 'MISSING_EMAIL', 
          message: 'Email is required for Zoho verification'
        }
      }));
    }
    
    try {
      console.log('[N8N] Verifying user exists in Zoho CRM for email:', supabaseResult.email);
      return {
        ...supabaseResult,
        zohoData: await deps.n8nClient.verifyZohoContact(supabaseResult.email)
      };
    } catch (error) {
      console.error('[N8N] User verification error:', error);
      // Si el usuario no existe en Zoho, lanzar error de negocio
      throw new Error(JSON.stringify({
        status: 403,
        message: 'User not registered in CRM system',
        details: { 
          errorCode: 'USER_NOT_IN_CRM', 
          message: 'User authenticated but not registered in CRM system'
        }
      }));
    }
  };
  
  // 5. Obtener compañías asociadas al usuario
  const getUserCompanies = async (userData) => {
    if (!userData) {
      console.log('[N8N] Skipping company retrieval - authentication failed in previous step');
      return null; // Si hay un error previo, pasar al siguiente paso
    }
    
    // Verificar que tengamos los datos de Zoho necesarios
    if (!userData.zohoData || !userData.zohoData.userId) {
      console.warn('[N8N] Cannot get companies - missing Zoho user ID');
      // Continuar con el flujo pero sin compañías
      return {
        ...userData,
        companies: []
      };
    }
    
    try {
      console.log('[N8N] Getting companies for user:', userData.zohoData.userId);
      const companiesResult = await deps.n8nClient.getUserCompanies(userData.zohoData.userId);
      
      return {
        ...userData,
        companies: companiesResult.companies
      };
    } catch (error) {
      console.warn('[N8N] Error getting companies:', error);
      // Si hay error al obtener compañías, continuar pero con lista vacía
      return {
        ...userData,
        companies: []
      };
    }
  };
  
  // 6. Procesar el resultado final
  const processAuthResult = (authData) => {
    if (!authData) {
      console.log('[AUTH] No authentication data available, authentication failed');
      return Result.ok({
        isAuthenticated: false,
        reason: 'Authentication failed',
        errorCode: 'AUTH_FAILED',
        errorDetails: { message: 'Authentication pipeline returned no data' }
      });
    }
    
    // Verificar que tengamos los datos necesarios para considerar la autenticación exitosa
    if (!authData.email) {
      console.log('[AUTH] Missing required authentication data, authentication failed');
      return Result.ok({
        isAuthenticated: false,
        reason: 'Authentication failed - missing required data',
        errorCode: 'MISSING_AUTH_DATA',
        errorDetails: { 
          message: 'Authentication result is missing required data',
          missingFields: !authData.email ? 'email' : 'unknown'
        }
      });
    }
    
    console.log('[AUTH] Authentication successful, processing result');
    return Result.ok({
      isAuthenticated: true,
      email: authData.email,
      userDetails: {
        ...authData.userDetails,
        zohoDetails: authData.zohoData ? authData.zohoData.userDetails : undefined
      },
      companies: authData.companies || [],
      session: authData.session
    });
  };
  
  // 7. Manejar errores de autenticación
  const handleAuthError = (error) => {
    console.error('[AUTH] Authentication error:', error);
    
    // Extraer información detallada del error
    const errorInfo = extractErrorInfo(error);
    console.log('[AUTH] Extracted error info:', errorInfo);
    
    // Determinar si el error contiene detalles JSON
    let errorDetails = {};
    try {
      if (typeof error.message === 'string' && error.message.startsWith('{')) {
        errorDetails = JSON.parse(error.message).details || {};
      } else if (errorInfo.details) {
        errorDetails = errorInfo.details;
      }
    } catch (e) {
      console.error('[AUTH] Error parsing error details:', e);
    }
    
    const errorMessage = errorDetails.message || error.message || 'Invalid credentials';
    const errorCode = errorDetails.errorCode || 'AUTH_ERROR';
    
    console.log('[AUTH] Final error details:', { errorMessage, errorCode, errorDetails });
    
    return Result.ok({
      isAuthenticated: false,
      reason: errorMessage,
      errorCode: errorCode,
      errorDetails: errorDetails,
      stackTrace: errorInfo.stack
    });
  };
  
  // Ejecutar el pipeline de autenticación
  try {
    // Verificar servicio de autenticación primero
    const serviceCheck = checkAuthService();
    if (serviceCheck) {
      console.log('[AUTH] Service check failed:', serviceCheck.unwrap());
      return serviceCheck;
    }
    
    console.log('[AUTH] Starting authentication pipeline');
    
    // Ejecutar el pipeline con pipeAsync
    return await tryCatchAsync(async () => {
      return await pipeAsync(
        prepareAuthData,
        authenticateWithSupabase,
        verifyUserInZoho,
        getUserCompanies,
        processAuthResult
      )();
    })().catch(handleAuthError);
  } catch (error) {
    console.error('[AUTH] Unhandled exception in verifyCredentials:', error);
    return handleAuthError(error);
  }
};

/**
 * Handles successful login events
 * Generates access and refresh tokens using JWT
 * @param {Object} event - Login succeeded event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleLoginSucceeded = async (event, deps) => {
  return tryCatchAsync(async () => {
    // Generate secure JWT tokens
    const accessToken = generateAccessToken(event.email);
    const refreshToken = generateRefreshToken(event.email);
    
    // Create a new event with tokens (immutable pattern)
    const enrichedEvent = deepFreeze({
      ...event,
      accessToken,
      refreshToken
    });
    
    // Store refresh token for later validation
    // This is a side effect, but isolated in this function
    const tokenEvent = deepFreeze({
      type: 'REFRESH_TOKEN_STORED',
      email: event.email,
      refreshToken,
      timestamp: event.timestamp
    });
    
    // Store token event and handle potential errors functionally
    const storeResult = await deps.storeEvent(tokenEvent);
    
    if (storeResult.isError) {
      console.error('Failed to store refresh token:', storeResult.unwrapError());
      // Continue even if token storage fails
    }
    
    return Result.ok(enrichedEvent);
  })().then(result => 
    // Ensure we always return the enriched event even if token storage fails
    result.isError 
      ? Result.ok(event) 
      : result
  );
};

/**
 * Handles refresh token validation
 * Verifies JWT signature and expiration, then generates new tokens
 * @param {Object} event - Refresh token validation event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleRefreshTokenValidated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    const { refreshToken, email } = event;
    
    // Verify the refresh token
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      // Check if token is a refresh token
      if (decoded.type !== 'refresh') {
        // Create invalid token event
        const invalidTokenEvent = deepFreeze({
          type: 'INVALID_REFRESH_TOKEN',
          email,
          reason: 'Token is not a refresh token',
          timestamp: new Date().toISOString()
        });
        
        await deps.storeEvent(invalidTokenEvent);
        return invalidTokenEvent;
      }
      
      // Check if token belongs to the user
      if (decoded.email !== email) {
        // Create invalid token event
        const invalidTokenEvent = deepFreeze({
          type: 'INVALID_REFRESH_TOKEN',
          email,
          reason: 'Token does not belong to user',
          timestamp: new Date().toISOString()
        });
        
        await deps.storeEvent(invalidTokenEvent);
        return invalidTokenEvent;
      }
      
      // Generate new tokens
      const accessToken = generateAccessToken(email);
      const newRefreshToken = generateRefreshToken(email);
      
      // Create token refreshed event
      const tokenRefreshedEvent = deepFreeze({
        type: 'TOKEN_REFRESHED',
        email,
        accessToken,
        refreshToken: newRefreshToken,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(tokenRefreshedEvent);
      return tokenRefreshedEvent;
      
    } catch (error) {
      // Token verification failed
      const invalidTokenEvent = deepFreeze({
        type: 'INVALID_REFRESH_TOKEN',
        email,
        reason: error.message || 'Invalid token',
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(invalidTokenEvent);
      return invalidTokenEvent;
    }
  })();
};

/**
 * Generates a JWT access token
 * Pure function with no side effects
 * @param {string} email - User email to include in the token
 * @returns {string} - JWT access token
 */
const generateAccessToken = (email) => {
  return jwt.sign(
    { email, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generates a JWT refresh token
 * Pure function with no side effects
 * @param {string} email - User email to include in the token
 * @returns {string} - JWT refresh token
 */
const generateRefreshToken = (email) => {
  return jwt.sign(
    { email, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
};

/**
 * Handles ticket creation
 * @param {Object} event - Ticket creation event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleTicketCreated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Creating ticket in external system:', event.ticketDetails);
    
    // Create the ticket in the external system
    const createResult = await deps.createTicket({
      ...event.ticketDetails,
      email: event.email
    });
    
    if (!createResult.isOk) {
      console.error('Failed to create ticket:', createResult.unwrapError());
      
      // Create ticket creation failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_CREATION_FAILED',
        email: event.email,
        ticketDetails: event.ticketDetails,
        error: createResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Get the created ticket details
    const createdTicket = createResult.unwrap();
    
    // Create ticket created success event
    const successEvent = deepFreeze({
      ...event,
      externalTicketId: createdTicket.id,
      status: 'created'
    });
    
    return successEvent;
  })();
};

/**
 * Handles ticket updates
 * @param {Object} event - Ticket update event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleTicketUpdated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Updating ticket in external system:', event.ticketId);
    
    // Update the ticket in the external system
    const updateResult = await deps.updateTicket({
      id: event.externalTicketId || event.ticketId,
      ...event.updateDetails,
      email: event.email
    });
    
    if (!updateResult.isOk) {
      console.error('Failed to update ticket:', updateResult.unwrapError());
      
      // Create ticket update failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_UPDATE_FAILED',
        email: event.email,
        ticketId: event.ticketId,
        externalTicketId: event.externalTicketId,
        updateDetails: event.updateDetails,
        error: updateResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Create ticket updated success event
    const successEvent = deepFreeze({
      ...event,
      status: 'updated'
    });
    
    return successEvent;
  })();
};

/**
 * Handles adding comments to tickets
 * @param {Object} event - Comment added event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleCommentAdded = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Adding comment to ticket in external system:', event.ticketId);
    
    // Add the comment in the external system
    const commentResult = await deps.addComment({
      ticketId: event.externalTicketId || event.ticketId,
      comment: event.comment,
      email: event.email
    });
    
    if (!commentResult.isOk) {
      console.error('Failed to add comment:', commentResult.unwrapError());
      
      // Create comment failed event
      const failedEvent = deepFreeze({
        type: 'COMMENT_FAILED',
        email: event.email,
        ticketId: event.ticketId,
        externalTicketId: event.externalTicketId,
        comment: event.comment,
        error: commentResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Create comment added success event
    const successEvent = deepFreeze({
      ...event,
      externalCommentId: commentResult.unwrap().id,
      status: 'added'
    });
    
    return successEvent;
  })();
};

/**
 * Handles ticket escalation
 * @param {Object} event - Ticket escalation event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleTicketEscalated = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Escalating ticket in external system:', event.ticketId);
    
    // Escalate the ticket in the external system
    const escalateResult = await deps.escalateTicket({
      id: event.externalTicketId || event.ticketId,
      escalationLevel: event.escalationLevel,
      reason: event.reason,
      email: event.email
    });
    
    if (!escalateResult.isOk) {
      console.error('Failed to escalate ticket:', escalateResult.unwrapError());
      
      // Create escalation failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_ESCALATION_FAILED',
        email: event.email,
        ticketId: event.ticketId,
        externalTicketId: event.externalTicketId,
        escalationLevel: event.escalationLevel,
        reason: event.reason,
        error: escalateResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Create escalation success event
    const successEvent = deepFreeze({
      ...event,
      status: 'escalated'
    });
    
    return successEvent;
  })();
};

/**
 * Handles user registration requests
 * Verifies contact in Zoho CRM and registers user in Supabase
 * @param {Object} event - User registration request event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 */
const handleUserRegistrationRequested = async (event, deps) => {
  // Use tryCatchAsync to handle errors functionally
  return tryCatchAsync(async () => {
    console.log('Verifying contact in Zoho CRM:', event.email);
    
    // Verify contact in Zoho CRM
    const verifyResult = await deps.n8nClient.verifyZohoContact(event.email);
    
    if (verifyResult.isError) {
      console.error('Failed to verify contact:', verifyResult.unwrapError());
      
      // Create verification failed event
      const failedEvent = deepFreeze({
        type: 'CONTACT_VERIFICATION_FAILED',
        email: event.email,
        reason: verifyResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Register user in Supabase
    const registerResult = await registerSupabaseUser(deps.supabaseAuth)(event.email, event.password);
    
    if (registerResult.isError) {
      console.error('Failed to register user:', registerResult.unwrapError());
      
      // Create registration failed event
      const failedEvent = deepFreeze({
        type: 'REGISTRATION_FAILED',
        email: event.email,
        reason: registerResult.unwrapError().message,
        timestamp: new Date().toISOString()
      });
      
      await deps.storeEvent(failedEvent);
      return failedEvent;
    }
    
    // Create registration success event
    const successEvent = deepFreeze({
      type: 'REGISTRATION_SUCCEEDED',
      email: event.email,
      userId: registerResult.unwrap().userId,
      timestamp: new Date().toISOString()
    });
    
    return successEvent;
  })();
};

/**
 * Encripta una contraseña para almacenamiento seguro en eventos
 * @param {string} password - Contraseña a encriptar
 * @returns {string} - Contraseña encriptada en formato hexadecimal
 */
const encryptPassword = (password) => {
  if (!password) return null;
  
  try {
    // Usar una clave de encriptación basada en variables de entorno
    // En producción, esto debería ser una clave segura almacenada en secretos
    const encryptionKey = process.env.PASSWORD_ENCRYPTION_KEY || 
                          process.env.JWT_SECRET || 
                          'secure-encryption-key-for-events';
    
    // Crear un hash SHA-256 de la contraseña con la clave
    const hash = crypto.createHmac('sha256', encryptionKey)
                       .update(password)
                       .digest('hex');
    
    // Devolver el hash con un prefijo para indicar que está encriptado
    return `enc:${hash}`;
  } catch (error) {
    console.error('❌ Error al encriptar contraseña:', error);
    return 'enc:error';
  }
};
