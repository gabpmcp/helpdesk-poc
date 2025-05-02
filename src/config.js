/**
 * Configuración del servidor basada en los principios FCIS (Separación de Interfaces Funcionales y Composicionales)
 * 
 * Estrategia de carga de configuración:
 * 1. En desarrollo: Se cargan variables desde .env
 * 2. En producción: Se intenta cargar desde runtime-config.json (k8s/contenedor)
 * 3. Si no existe el archivo, se usa process.env (variables de Azure DevOps)
 */

// Importar utilidades para inmutabilidad
import fs from 'fs';
import path from 'path';

/**
 * Detecta y normaliza el entorno de ejecución
 * Solo permite 'development' o 'production'
 * @returns {string} 'production' o 'development'
 */
const detectEnvironment = () => {
  // Si NODE_ENV está explícitamente definido, normalizarlo
  if (process.env.NODE_ENV) {
    // Normalizar a solo development o production
    return process.env.NODE_ENV === 'development' ? 'development' : 'production';
  }
  
  // Detectar por hostname si es posible
  const isProduction = process.env.HOSTNAME && 
    (process.env.HOSTNAME.includes('api-platform.advancio.io') || 
     process.env.HOSTNAME.includes('platform.advancio.io'));
  
  return isProduction ? 'production' : 'development';
};

// Establecer NODE_ENV basado en la detección y normalización
process.env.NODE_ENV = detectEnvironment();
const isDevelopment = process.env.NODE_ENV === 'development';

// Solo cargar dotenv en desarrollo
if (isDevelopment) {
  console.log('🔧 Modo desarrollo: Cargando configuración desde .env');
  
  // Importación dinámica para evitar dependencias en producción
  import('dotenv').then(dotenv => {
    dotenv.config();
    console.log('📝 Variables de entorno cargadas desde .env');
  }).catch(err => {
    console.error('❌ Error cargando dotenv:', err);
  });
} else {
  console.log('🚀 Modo producción: Usando configuración inyectada');
  
  // Intentar cargar config desde archivo si existe (para Docker/k8s)
  try {
    const configPath = path.join(process.cwd(), 'runtime-config.json');
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('📄 Configuración cargada desde runtime-config.json');
      
      // Inyectar en process.env para mantener compatibilidad con el patrón actual
      Object.entries(configData).forEach(([category, values]) => {
        if (typeof values === 'object') {
          Object.entries(values).forEach(([key, value]) => {
            const envKey = key.toUpperCase();
            if (typeof value === 'string') {
              process.env[envKey] = value;
            }
          });
        }
      });
    } else {
      console.log('ℹ️ No se encontró runtime-config.json, usando variables de Azure DevOps');
    }
  } catch (error) {
    console.error('⚠️ No se pudo cargar runtime-config.json:', error.message);
  }
}

/**
 * Obtiene la configuración con defaults seguros
 * Aplicando principios de inmutabilidad
 * @returns {Object} Configuración inmutable (congelada)
 */
export function getConfig() {
  // Parsear orígenes CORS para permitir múltiples valores
  const parseCorsOrigins = (originsStr) => {
    if (!originsStr) return [];
    // Soporta formato delimitado por comas "origen1,origen2" o un solo origen
    return originsStr.includes(',') 
      ? originsStr.split(',').map(o => o.trim()).filter(Boolean)
      : [originsStr.trim()];
  };

  // Orígenes permitidos para CORS
  const defaultCorsOrigins = isDevelopment 
    ? ['http://localhost:5172'] 
    : ['https://platform.advancio.io'];
  
  // Combinar orígenes configurados con los predeterminados
  const configuredOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
  const corsOrigins = configuredOrigins.length > 0 
    ? configuredOrigins 
    : defaultCorsOrigins;

  // Crear objeto de configuración completamente nuevo
  const config = Object.freeze({
    // Servidor
    server: Object.freeze({
      port: parseInt(process.env.PORT || '3000', 10),
      nodeEnv: isDevelopment ? 'development' : 'production', // Solo permitir estos dos valores
      isProduction: !isDevelopment,
      baseUrl: process.env.API_URL || 'http://localhost:3000', // URL base para el backend
    }),
    
    // Seguridad
    security: Object.freeze({
      jwtSecret: process.env.JWT_SECRET || (isDevelopment 
                                         ? 'desarrollo_secreto_jwt' 
                                         : null),
      // Array inmutable de orígenes CORS permitidos
      corsOrigins: Object.freeze(corsOrigins),
      // Mantener corsOrigin para compatibilidad con código existente
      corsOrigin: corsOrigins[0] || ''
    }),
    
    // Servicios externos
    services: Object.freeze({
      n8n: Object.freeze({
        webhookBaseUrl: process.env.N8N_BASE_URL || 'https://n8n.advancio.io/webhook',
      }),
      supabase: Object.freeze({
        url: process.env.SUPABASE_URL || '',
        key: process.env.SUPABASE_KEY || '',
        serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
        anonKey: process.env.SUPABASE_ANON_KEY || '',
      }),
      zoho: Object.freeze({
        baseUrl: process.env.ZOHO_BASE_URL || 'https://desk.zoho.com/api/v1',
        apiKey: process.env.ZOHO_API_KEY || '',
        authToken: process.env.ZOHO_AUTH_TOKEN || '',
      })
    })
  });

  return config;
}

/**
 * Valida que la configuración tenga todos los valores requeridos para el entorno actual
 * @param {Object} conf - Configuración a validar
 * @returns {Array<string>} - Lista de errores encontrados
 */
export function validateConfig(conf) {
  const getMissingKeys = (conf) => {
    const check = (key, condition) => condition ? key : null;
    
    return [
      // En producción, requerir JWT_SECRET
      { key: 'JWT_SECRET', check: () => conf.server.nodeEnv === 'production' && !conf.security.jwtSecret },
      // Otras validaciones...
    ]
    .map(({ key, check }) => check() ? key : null)
    .filter(Boolean);
  };

  const missingKeys = getMissingKeys(conf);
  
  if (missingKeys.length > 0) {
    console.error('❌ Error de configuración: Faltan claves requeridas:', missingKeys.join(', '));
    if (!isDevelopment) {
      throw new Error(`Configuración inválida: Faltan claves requeridas: ${missingKeys.join(', ')}`);
    }
  }
  
  return missingKeys;
}

/**
 * Verifica si una config de runtime existe en el sistema de archivos
 * @returns {boolean} True si existe un archivo de configuración
 */
export function hasRuntimeConfig() {
  try {
    return fs.existsSync(path.join(process.cwd(), 'runtime-config.json'));
  } catch (e) {
    return false;
  }
}

export default getConfig;
