/**
 * Main application entry point
 * Wires together server and shell components
 */
import Koa from 'koa';
import { setupApiRoutes } from './api/index.js';
import { zohoClient, supabaseClient, config } from './shell/config.js';
import { notifyExternal } from './shell/notifications.js';

/**
 * Initialize Koa application
 */
const app = new Koa();

/**
 * Inject dependencies
 * This is where we wire together the pure core with the imperative shell
 */
const deps = {
  zohoClient,
  supabaseClient
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
app.use(setupApiRoutes(deps).routes());
app.use(setupApiRoutes(deps).allowedMethods());

/**
 * Start server
 */
app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`API endpoints:`);
  console.log(`- POST /api/commands - Central command endpoint`);
  console.log(`- GET /api/state/:userId - State reconstruction endpoint`);
});
