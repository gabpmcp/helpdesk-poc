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
 * Detecta automáticamente el entorno basado en la URL o variables
 * @returns {string} 'production' o 'development'
 */
const detectEnvironment = () => {
  // Si NODE_ENV está explícitamente definido, usarlo
  if (process.env.NODE_ENV) return process.env.NODE_ENV;
  
  // Detectar por hostname si es posible (en navegador no aplica)
  const isProduction = process.env.HOSTNAME && 
    (process.env.HOSTNAME.includes('api-platform.advancio.io') || 
     process.env.HOSTNAME.includes('platform.advancio.io'));
  
  return isProduction ? 'production' : 'development';
};

// Establecer NODE_ENV basado en la detección
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
  // Crear objeto de configuración completamente nuevo
  const config = Object.freeze({
    // Servidor
    server: Object.freeze({
      port: parseInt(process.env.PORT || '3000', 10),
      nodeEnv: process.env.NODE_ENV || 'production',
      isProduction: process.env.NODE_ENV !== 'development',
      baseUrl: process.env.API_URL || 'http://localhost:3000', // URL base para el backend
    }),
    
    // Seguridad
    security: Object.freeze({
      jwtSecret: process.env.JWT_SECRET || (isDevelopment 
                                         ? 'desarrollo_secreto_jwt' 
                                         : null),
      corsOrigin: process.env.CORS_ORIGIN || (isDevelopment 
                                          ? 'http://localhost:5172' // Frontend local
                                          : 'https://platform.advancio.io'), // Frontend producción
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
 * Verifica que la configuración crítica esté presente
 * Implementación puramente funcional sin efectos secundarios
 * @param {Object} config - Configuración a validar 
 * @returns {Object} La misma configuración validada (inmutable)
 * @throws {Error} Si faltan valores críticos
 */
export function validateConfig(config) {
  // Función pura que devuelve un array de claves faltantes
  const getMissingKeys = (conf) => {
    // Usa Array.filter para mantener inmutabilidad (en lugar de push)
    const requiredProductionKeys = [
      { key: 'JWT_SECRET', check: () => conf.server.nodeEnv === 'production' && !conf.security.jwtSecret },
      { key: 'SUPABASE_URL', check: () => conf.server.nodeEnv === 'production' && !conf.services.supabase.url },
      { key: 'SUPABASE_KEY', check: () => conf.server.nodeEnv === 'production' && !conf.services.supabase.key }
    ];
    
    // Usa filter en lugar de un array mutable con push
    return requiredProductionKeys
      .filter(item => item.check())
      .map(item => item.key);
  };
  
  // Obtener claves faltantes de manera inmutable
  const missingKeys = getMissingKeys(config);
  
  // Verificación de errores
  if (missingKeys.length > 0) {
    throw new Error(`Configuración crítica faltante: ${missingKeys.join(', ')}`);
  }
  
  // Devolvemos la configuración original sin modificarla
  return config;
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

// Exportación por defecto de la configuración validada
export default function() {
  const config = getConfig();
  return validateConfig(config);
}
