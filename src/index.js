/**
 * Main application entry point
 * Wires together server and shell components
 */
import Koa from 'koa';
import { setupApiRoutes } from './api/index.js';
import { supabaseClient, supabaseAuth, config } from './shell/config.js';
import n8nClient from './shell/n8nClient.js';

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

// Set up API routes
const apiRouter = setupApiRoutes(deps);
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

/**
 * Start server
 */
app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`API endpoints:`);
  console.log(`- POST /api/commands - Central command endpoint`);
  console.log(`- GET /api/state/:userId - State reconstruction endpoint`);
});
