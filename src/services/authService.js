/**
 * Authentication service - FCIS pattern compliant
 * Functional, Composable, Isolated, Stateless
 */
import jwt from 'jsonwebtoken';
import { Result, tryCatchAsync } from '../utils/functional.js';

// JWT settings (should be in environment variables in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = '1h';
const REFRESH_TOKEN_EXPIRY = '7d';

// Configuración del entorno
const getConfig = () => {
  return {
    server: {
      isProduction: process.env.NODE_ENV === 'production'
    }
  };
};

/**
 * Pure function to validate credentials against Supabase
 * @param {Object} supabaseClient - Supabase client instance
 * @returns {Function} - A function that validates email and password
 */
export const validateCredentials = (supabaseClient) => async (email, password) => {
  return tryCatchAsync(async () => {
    // Obtener la configuración del entorno de forma inmutable
    const config = getConfig();
    
    // Omitir validación solo en desarrollo y cuando está explícitamente configurado
    if (!config.server.isProduction && process.env.SKIP_AUTH_VALIDATION === 'true') {
      console.warn('⚠️ Omitiendo validación de autenticación en modo desarrollo');
      return Result.ok({ email });
    }
    
    // Use Supabase auth to sign in with email and password
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      console.error('Supabase authentication error:', error.message);
      return Result.error('Invalid credentials');
    }
    
    if (!data || !data.user) {
      return Result.error('User not found');
    }
    
    return Result.ok({ email: data.user.email });
  })();
};

/**
 * Pure function to generate a JWT token
 * @param {String} email - User's email
 * @param {String} tokenType - Type of token ('access' or 'refresh')
 * @returns {String} - JWT token
 */
export const generateToken = (email, tokenType = 'access') => {
  const expiry = tokenType === 'refresh' ? REFRESH_TOKEN_EXPIRY : ACCESS_TOKEN_EXPIRY;
  
  return jwt.sign(
    { email, type: tokenType },
    JWT_SECRET,
    { expiresIn: expiry }
  );
};

/**
 * Pure function to verify a JWT token
 * @param {String} token - JWT token to verify
 * @returns {Result<Object, Error>} - Result with decoded token or error
 */
export const verifyToken = (token) => {
  return tryCatchAsync(async () => {
    if (!token) {
      return Result.error('Token is required');
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      return Result.ok(decoded);
    } catch (error) {
      return Result.error('Invalid or expired token');
    }
  })();
};

/**
 * Pure function to create an authentication response
 * @param {String} email - User's email
 * @returns {Object} - Authentication response with tokens
 */
export const createAuthResponse = (email) => {
  const accessToken = generateToken(email, 'access');
  const refreshToken = generateToken(email, 'refresh');
  
  return {
    success: true,
    email,
    accessToken,
    refreshToken
  };
};

/**
 * Pure function to create an error response
 * @param {String} message - Error message
 * @returns {Object} - Error response
 */
export const createErrorResponse = (message) => {
  return {
    success: false,
    error: message
  };
};
