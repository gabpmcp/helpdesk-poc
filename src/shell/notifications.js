/**
 * Handles side-effects based on events
 * Part of the imperative shell
 */
import { v4 as generateUUID } from 'uuid';
import jwt from 'jsonwebtoken';
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
    `[SUPABASE] ${user?.exists ? `User found: ${user.email}` : 'User not found'}`
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

/**
 * Logs in a user with Supabase Auth
 * @param {Object} supabaseAuth - Supabase auth functions
 * @returns {Function} - Function that takes email and password and returns a Result
 */
export const loginUserWithSupabase = (supabaseAuth) => (email, password) =>
  Promise.resolve({ supabaseAuth, email, password })
    .then(assertAuthAvailable)
    .then(attemptLogin)
    .then(validateLoginResponse)
    .then(buildLoginResult)
    .catch((err) => Promise.reject(parseError(err, 'LOGIN_FAILED')));

const assertAuthAvailable = ({ supabaseAuth, email, password }) =>
  supabaseAuth?.signIn instanceof Function
    ? { supabaseAuth, email, password }
    : Promise.reject(
        new Error(
          JSON.stringify({
            status: 503,
            message: 'Supabase authentication not available',
            details: {
              errorCode: 'SUPABASE_NOT_CONFIGURED',
              message: 'Supabase authentication not available'
            }
          })
        )
      );

const attemptLogin = ({ supabaseAuth, email, password }) =>
  supabaseAuth
    .signIn({ email, password })
    .then(({ data, error }) => ({ data, error, email }));

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

const assertValidCredentials = ({ email, password }) =>
  typeof email === 'string' && typeof password === 'string'
    ? { email, password }
    : Promise.reject(
        new Error(
          `Invalid input: email and password must be strings. Got: ${typeof email}, ${typeof password}`
        )
      );

const toPayload = ({ email, password }) => ({
  url: '/auth/v1/signup',
  body: JSON.stringify({ email, password }),
  debug: { email, password }
});

const postSignUpRequest = (supabaseUrl, supabaseAnonKey) => ({ url, body, debug }) =>
  fetch(`${supabaseUrl}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    },
    body
  }).then((res) => res.json()
    .then((json) =>
      res.ok
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
          )
    )
  );

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
export const registerSupabaseUser = (supabaseAuth) => (email, password) =>
  Promise.resolve({ email, password })
    .then(tap(logRegisterAttempt))
    .then(assertSignUpAvailable(supabaseAuth))
    .then(signUpWithSupabase({supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY}))
    .then(validateSignUpResponse)
    .then(tap(logRegisterSuccess))
    .catch((err) => Promise.reject(parseError(err, 'REGISTRATION_FAILED')));

/**
 * Handles login request events
 * @param {Object} event - Login request event
 * @param {NotificationDeps} deps - Dependencies for notification operations
 * @returns {Promise<r>} - Result containing the login event
 */
const handleLoginRequested = (event, deps) =>
  Promise.resolve(event)
    .then(tap(logStart))
    .then(assertDepsAvailable(deps))
    .then(verifyContact(deps))
    .then(storeContactData(deps))
    .then(checkSupabase(deps))
    .then(authenticateOrRegister(event, deps))
    .catch(handleUnhandled(event, deps));

const logStart = ({ email }) =>
  console.log('[LOGIN] Processing login request for:', email);

const assertDepsAvailable = (deps) => (event) => {
  const missing = !deps?.n8nClient || !deps?.supabaseAuth;
  return missing
    ? Promise.reject({
        reason: 'Authentication services not available',
        errorCode: 'SERVICE_UNAVAILABLE',
      })
    : event;
};

const verifyContact = (deps) => (event) =>
  deps.n8nClient
    .verifyZohoContact(event.email)
    .then((result) =>
      result.isError
        ? Promise.reject(parseError(result.unwrapError(), 'CONTACT_VERIFICATION_FAILED'))
        : { event, contact: result.unwrap() }
    );

const storeContactData = (deps) => ({ event, contact }) =>
  Promise.resolve({ event, contact });

const checkSupabase = (deps) => ({ event, contact }) =>
  checkSupabaseUser(deps.supabaseClient)(event.email)
    .then((user) => ({ event, contact, user })) // el valor `null` es manejable downstream
    .catch((err) =>
      Promise.reject(parseError(err, 'USER_VERIFICATION_FAILED'))
    );

const authenticateOrRegister = (event, deps) => ({ contact, user }) =>
  user
    ? loginFlow(event, contact, deps)
    : registerFlow(event, contact, deps);

const loginFlow = (event, contact, deps) =>
  loginUserWithSupabase(deps.supabaseAuth)(event.email, event.password)
    .then(attachCompanies(deps, contact))
    .then((companiesAndUser) =>
      buildAuthResult(event, contact, companiesAndUser, false)
    )
    .then((authResult) => handleSuccessfulLogin(event, authResult, deps))
    .catch((err) =>
      handleFailedLogin(event, parseError(err, 'LOGIN_FAILED'), deps)
    );

const registerFlow = (event, contact, deps) =>
  registerSupabaseUser(deps.supabaseAuth)(event.email, event.password)
  .then(withCompanies(deps, contact))
  .then((companiesAndUser) =>
    storeUserRegisteredEvent(event, contact, companiesAndUser, deps)
  )
  .then((authResult) => handleSuccessfulLogin(event, authResult, deps));
    
export const withCompanies = (deps, contact) => (userData) =>
  Promise.resolve(contact?.contact?.id)
    .then(fetchCompaniesOrEmpty(deps))
    .then(buildUserWithCompanies(userData));

const fetchCompaniesOrEmpty = (deps) => (contactId) =>
  contactId
    ? deps.n8nClient
        .getUserCompanies(contactId)
        .then(({ companies }) => companies)
        .catch((err) => {
          console.warn('[LOGIN] Error fetching companies, continuing with empty list:', err);
          return [];
        })
    : Promise.resolve([]);

const buildUserWithCompanies = (userData) => (companies) => ({
  userData,
  companies,
});

const storeUserRegisteredEvent = (event, contact, { userData, companies }, deps) => {
  const userRegisteredEvent = deepFreeze({
    type: 'USER_REGISTERED',
    userId: userData.userId,
    email: userData.email,
    zohoContactId: contact.contact?.id,
    zohoContactDetails: contact.contact,
    companies,
    timestamp: event.timestamp,
  });

  return deps.storeEvent(userRegisteredEvent).then((result) => {
    if (result.isError) {
      console.error('[LOGIN] Failed to store USER_REGISTERED event:', result.unwrapError());
    } else {
      console.log('[LOGIN] USER_REGISTERED event stored successfully');
    }
    return buildAuthResult(event, contact, { userData, companies }, true);
  });
};

const buildAuthResult = (event, contact, { userData, companies }, isNewUser) => ({
  isAuthenticated: true,
  userId: userData.userId,
  email: userData.email,
  userDetails: {
    ...userData.userDetails,
    zohoContactId: contact.contact?.id,
    zohoContactDetails: contact.contact,
  },
  companies,
  session: userData.session,
  ...(isNewUser ? { isNewUser: true } : {}),
});


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

const tap = (fn) => (val) => (fn(val), val);

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
      userId: email,
      email: email,
      userDetails: {
        id: email,
        email: email,
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
      if (!result.unwrap || !result.unwrap().userId) {
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
      
      return result.unwrap();
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
    if (!authData.userId || !authData.email) {
      console.log('[AUTH] Missing required authentication data, authentication failed');
      return Result.ok({
        isAuthenticated: false,
        reason: 'Authentication failed - missing required data',
        errorCode: 'MISSING_AUTH_DATA',
        errorDetails: { 
          message: 'Authentication result is missing required data',
          missingFields: !authData.userId ? 'userId' : !authData.email ? 'email' : 'unknown'
        }
      });
    }
    
    console.log('[AUTH] Authentication successful, processing result');
    return Result.ok({
      isAuthenticated: true,
      userId: authData.userId,
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
    const accessToken = generateAccessToken(event.userId);
    const refreshToken = generateRefreshToken(event.userId);
    
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
      userId: event.userId,
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
    const { refreshToken, userId } = event;
    
    // Verify the refresh token
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      
      // Check if token is a refresh token
      if (decoded.type !== 'refresh') {
        // Create invalid token event
        const invalidTokenEvent = deepFreeze({
          type: 'INVALID_REFRESH_TOKEN',
          userId,
          reason: 'Token is not a refresh token',
          timestamp: new Date().toISOString()
        });
        
        await deps.storeEvent(invalidTokenEvent);
        return invalidTokenEvent;
      }
      
      // Check if token belongs to the user
      if (decoded.userId !== userId) {
        // Create invalid token event
        const invalidTokenEvent = deepFreeze({
          type: 'INVALID_REFRESH_TOKEN',
          userId,
          reason: 'Token does not belong to user',
          timestamp: new Date().toISOString()
        });
        
        await deps.storeEvent(invalidTokenEvent);
        return invalidTokenEvent;
      }
      
      // Generate new tokens
      const accessToken = generateAccessToken(userId);
      const newRefreshToken = generateRefreshToken(userId);
      
      // Create token refreshed event
      const tokenRefreshedEvent = deepFreeze({
        type: 'TOKEN_REFRESHED',
        userId,
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
        userId,
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
 * @param {string} userId - User ID to include in the token
 * @returns {string} - JWT access token
 */
const generateAccessToken = (userId) => {
  return jwt.sign(
    { userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

/**
 * Generates a JWT refresh token
 * Pure function with no side effects
 * @param {string} userId - User ID to include in the token
 * @returns {string} - JWT refresh token
 */
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId, type: 'refresh' },
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
      userId: event.userId
    });
    
    if (!createResult.isOk) {
      console.error('Failed to create ticket:', createResult.unwrapError());
      
      // Create ticket creation failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_CREATION_FAILED',
        userId: event.userId,
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
      userId: event.userId
    });
    
    if (!updateResult.isOk) {
      console.error('Failed to update ticket:', updateResult.unwrapError());
      
      // Create ticket update failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_UPDATE_FAILED',
        userId: event.userId,
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
      userId: event.userId
    });
    
    if (!commentResult.isOk) {
      console.error('Failed to add comment:', commentResult.unwrapError());
      
      // Create comment failed event
      const failedEvent = deepFreeze({
        type: 'COMMENT_FAILED',
        userId: event.userId,
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
      userId: event.userId
    });
    
    if (!escalateResult.isOk) {
      console.error('Failed to escalate ticket:', escalateResult.unwrapError());
      
      // Create escalation failed event
      const failedEvent = deepFreeze({
        type: 'TICKET_ESCALATION_FAILED',
        userId: event.userId,
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
