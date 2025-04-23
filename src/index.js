/**
 * Main application entry point
 * Wires together server and shell components
 */
import Koa from 'koa';
import cors from '@koa/cors';
import http from 'http';
import { initializeApi } from './api/index.js';
import { createClient } from '@supabase/supabase-js';
import n8nClient from './shell/n8nClient.js';
import { initializeWebSocketServer } from './ws/index.js';
import getConfig, { validateConfig } from './config.js';

/**
 * Obtener y validar la configuración del sistema
 */
const config = getConfig();
console.log(`🔧 Modo ${config.server.nodeEnv}: Configuración cargada`);

/**
 * Crear clientes de servicio basados en la configuración
 */
const supabaseClient = config.services.supabase.url && config.services.supabase.key
  ? createClient(config.services.supabase.url, config.services.supabase.key)
  : null;

if (supabaseClient) {
  console.log('✅ Supabase configurado correctamente');
} else {
  console.warn('⚠️ Supabase no configurado - funcionalidad limitada');
}

/**
 * Initialize Koa application
 */
const app = new Koa();

/**
 * Inject dependencies
 * This is where we wire together the pure core with the imperative shell
 */
const deps = {
  n8nClient,
  supabaseClient,
  supabaseAuth: {
    // Implementar métodos de autenticación basados en la configuración
    signIn: async (email, password) => {
      if (!supabaseClient) throw new Error('Supabase no configurado');
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email, password
      });
      if (error) throw error;
      return data;
    },
    // Otros métodos de autenticación...
  }
};

/**
 * Configure middleware and routes
 */

// Enable CORS for all routes with specific origin
const allowedOrigins = [
  'http://localhost:5172',
  'https://localhost:5172',
  'http://localhost:5173',
  'https://localhost:5173',
  'http://localhost:3000',
  'http://localhost:3001',
  'https://platform.advancio.io',
  'https://api-platform.advancio.io'
];

// Función auxiliar para facilitar pruebas en desarrollo
const isDevelopment = process.env.NODE_ENV === 'development';

app.use(cors({
  origin: (ctx) => {
    const requestOrigin = ctx.request.header.origin;
    
    // Logging de depuración para identificar el origen exacto de las solicitudes
    console.log(`📝 CORS: Solicitud recibida de origen: ${requestOrigin}`);
    
    // Para localhost:5172, siempre permitimos - es nuestro frontend principal
    if (requestOrigin === 'http://localhost:5172') {
      console.log(`✅ CORS: Permitiendo origen principal frontend: ${requestOrigin}`);
      return requestOrigin;
    }
    
    // En desarrollo, podemos ser más permisivos, pero SIEMPRE devolvemos el origen específico
    // cuando credentials es 'include' - NUNCA usar '*' cuando se usan credenciales
    if (isDevelopment) {
      // Verificar si el origen existe - no podemos devolver null o '' como origen válido
      if (!requestOrigin) {
        console.warn(`⚠️ CORS: Origen no especificado, usando 'null' en modo desarrollo`);
        return 'null'; // Usamos 'null' como última opción (puede fallar con credentials)
      }
      
      console.log(`✅ CORS: Permitiendo origen en modo desarrollo: ${requestOrigin}`);
      return requestOrigin; // Siempre devolver el origen específico cuando se usan credenciales
    }
    
    // En producción, verificamos contra la lista de orígenes permitidos
    if (allowedOrigins.includes(requestOrigin)) {
      console.log(`✅ CORS: Origen permitido: ${requestOrigin}`);
      return requestOrigin;
    }
    
    // Si el origen no está permitido, devolvemos un valor que hará que el navegador bloquee la solicitud
    // pero con un mensaje de error claro en la consola para depuración
    console.warn(`❌ CORS: Origen rechazado: ${requestOrigin}`);
    return ''; // Esto rechazará la solicitud CORS pero evita falsos positivos
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  // Añadir la exposición de encabezados para permitir que el frontend los acceda
  exposeHeaders: ['Content-Length', 'Date', 'X-Request-Id'],
  // Aumentar maxAge para reducir número de solicitudes preflight
  maxAge: 86400 // 24 horas en segundos
}));

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = {
      error: {
        message: err.message,
        code: err.code || 'INTERNAL_SERVER_ERROR'
      }
    };
    console.error('Request error:', err);
  }
});

// Add a simple health check endpoint for connectivity testing
app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.body = { status: 'ok', timestamp: new Date().toISOString() };
    ctx.status = 200;
  } else {
    await next();
  }
});

initializeApi(app, deps);

/**
 * Create HTTP server to attach WebSockets
 */
const server = http.createServer(app.callback());

/**
 * Initialize WebSocket server
 */
initializeWebSocketServer(server);

/**
 * Start server
 */
server.listen(config.server.port, () => {
  console.log(`Server running on port ${config.server.port}`);
  console.log(`API endpoints:`);
  console.log(`- POST /api/commands - Central command endpoint`);
  console.log(`- GET /api/state/:userId - State reconstruction endpoint`);
  console.log(`- WS /ws/tickets/:ticketId - WebSocket chat for tickets`);
  console.log(`- GET /health - Health check endpoint`);
});
