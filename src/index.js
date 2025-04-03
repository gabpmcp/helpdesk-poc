/**
 * Main application entry point
 * Wires together server and shell components
 */
import Koa from 'koa';
import cors from '@koa/cors';
import http from 'http';
import { initializeApi } from './api/index.js';
import { supabaseClient, supabaseAuth, config } from './shell/config.js';
import n8nClient from './shell/n8nClient.js';
import { initializeWebSocketServer } from './ws/index.js';

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
  supabaseAuth
};

/**
 * Configure middleware and routes
 */

// Enable CORS for all routes with specific origin
app.use(cors({
  origin: 'http://localhost:5172', // Especificar exactamente el origen permitido
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
server.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`API endpoints:`);
  console.log(`- POST /api/commands - Central command endpoint`);
  console.log(`- GET /api/state/:userId - State reconstruction endpoint`);
  console.log(`- WS /ws/tickets/:ticketId - WebSocket chat for tickets`);
});
