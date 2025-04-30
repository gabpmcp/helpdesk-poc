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

// Configuración simplificada de CORS para evitar problemas
app.use(cors({
  origin: function(ctx) {
    const requestOrigin = ctx.request.header.origin;
    console.log(`📝 CORS: Solicitud recibida de origen: ${requestOrigin}`);
    
    // En desarrollo, permitir todos los orígenes conocidos
    if (isDevelopment) {
      if (allowedOrigins.includes(requestOrigin)) {
        return requestOrigin;
      }
      
      // Para solicitudes sin origen (como curl o postman)
      if (!requestOrigin) {
        return '*';
      }
      
      // En desarrollo también permitimos otros orígenes no listados
      return requestOrigin;
    }
    
    // En producción, ser más estrictos
    if (allowedOrigins.includes(requestOrigin)) {
      return requestOrigin;
    }
    
    return false; // Bloqueamos orígenes no permitidos en producción
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  exposeHeaders: ['Content-Length', 'Date', 'X-Request-Id'],
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

// Función principal asíncrona para inicializar la aplicación
const startServer = async () => {
  try {
    // Inicializar API de forma asíncrona
    await initializeApi(app, deps);
    
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
      console.log(`📝 Variables de entorno cargadas desde .env`);
    });
  } catch (error) {
    console.error('❌ Error al inicializar el servidor:', error);
    process.exit(1);
  }
};

// Iniciar el servidor
startServer();
