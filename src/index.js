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
  'http://localhost:3000',
  'http://localhost:3001',
  'https://platform.advancio.io'
];

app.use(cors({
  origin: (ctx) => {
    if (allowedOrigins.includes(ctx.request.header.origin)) {
      return ctx.request.header.origin;
    }
    return '';
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
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

// Initialize API with all routes (including projections)
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
});
