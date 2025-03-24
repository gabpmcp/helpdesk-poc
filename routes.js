import Router from '@koa/router';
import { transition, applyEvent, initialState } from './decision.js';
import { validateCommand } from './validator.js';
import { storeEvent, fetchEventsForUser } from './eventStore.js';
import { notifyExternal } from './notifications.js';

export const setupRoutes = (deps) => {
  const router = new Router();

  // --- Command endpoint (centralized) ---
  router.post('/api/commands', async (ctx) => {
    try {
      // Parse request body
      const command = await parseBody(ctx);
      
      // Validate command
      const validation = validateCommand(command);
      if (!validation.valid) {
        ctx.status = 400;
        ctx.body = { error: validation.reason };
        return;
      }
      
      // Generate event from command (pure function)
      const event = transition(command);
      
      // Store event in Supabase (side effect)
      return storeEvent(deps.supabaseClient)(event)
        .then(storedEvent => notifyExternal(storedEvent, deps))
        .then(processedEvent => {
          ctx.body = { success: true, event: processedEvent };
        })
        .catch(err => {
          ctx.status = 500;
          ctx.body = { error: err.message };
        });
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  });

  // --- State reconstruction endpoint ---
  router.get('/api/state/:userId', async (ctx) => {
    try {
      const userId = ctx.params.userId;
      
      // Fetch all events for user
      return fetchEventsForUser(deps.supabaseClient)(userId)
        .then(events => {
          // Reconstruct state from events (pure function)
          const state = events.reduce(
            (currentState, event) => applyEvent(currentState, event), 
            initialState
          );
          
          ctx.body = { state };
        })
        .catch(err => {
          ctx.status = 500;
          ctx.body = { error: err.message };
        });
    } catch (err) {
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  });

  return router;
};

/**
 * Helper function to parse request body
 */
const parseBody = async (ctx) => {
  return new Promise((resolve, reject) => {
    let body = '';
    
    ctx.req.on('data', (chunk) => {
      body += chunk.toString();
    });
    
    ctx.req.on('end', () => {
      try {
        const parsedBody = body ? JSON.parse(body) : {};
        resolve(parsedBody);
      } catch (err) {
        reject(new Error('Invalid JSON in request body'));
      }
    });
    
    ctx.req.on('error', reject);
  });
};