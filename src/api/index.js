/**
 * API endpoints for the FCIS architecture
 * Defines the /api/commands and /api/state/:userId endpoints
 */
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { validateCommand } from '../validators/commandSchema.js';
import { transition, applyEvent, initialState } from '../core/transition.js';
import { storeEvent, fetchEventsForUser } from '../shell/eventStore.js';
import { notifyExternal } from '../shell/notifications.js';

/**
 * JWT verification middleware
 * Verifies the Authorization header for protected routes
 */
const verifyJWT = (ctx, next) => {
  // Skip auth for login attempts
  if (ctx.path === '/api/commands' && ctx.request.body?.type === 'LOGIN_ATTEMPT') {
    return next();
  }
  
  const authHeader = ctx.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.body = { 
      error: { 
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      } 
    };
    return;
  }
  
  // In a real implementation, verify the JWT token here
  // For simplicity, we're just checking if it exists
  const token = authHeader.split(' ')[1];
  if (!token) {
    ctx.status = 401;
    ctx.body = { 
      error: { 
        message: 'Invalid token format',
        code: 'INVALID_TOKEN'
      } 
    };
    return;
  }
  
  // Add user info to context from token
  // In a real implementation, decode the JWT and set ctx.state.user
  ctx.state.user = { id: 'user-from-token' };
  
  return next();
};

/**
 * Sets up API routes
 */
export const setupApiRoutes = (deps) => {
  const router = new Router();
  
  // Add body parser middleware
  router.use(bodyParser());
  
  // Add JWT verification middleware for protected routes
  router.use('/api/commands', (ctx, next) => {
    // Skip auth check for login attempts which will be in the body
    if (ctx.method === 'POST' && ctx.request.body?.type === 'LOGIN_ATTEMPT') {
      return next();
    }
    return verifyJWT(ctx, next);
  });
  
  router.use('/api/state', verifyJWT);
  
  /**
   * POST /api/commands - Central command endpoint
   * Processes all commands from the frontend
   */
  router.post('/api/commands', async (ctx) => {
    try {
      const command = ctx.request.body;
      
      // Validate command
      const validation = validateCommand(command);
      if (!validation.success) {
        ctx.status = 400;
        ctx.body = { 
          error: { 
            message: 'Command validation failed',
            details: validation.error 
          } 
        };
        return;
      }
      
      // Generate event from command (pure function)
      const event = transition(validation.data);
      
      // Store event in Supabase (side effect)
      return storeEvent(deps.supabaseClient)(event)
        .then(storedEvent => {
          // Notify external systems (side effect)
          return notifyExternal(storedEvent, deps);
        })
        .then(processedEvent => {
          // Return appropriate response based on command type
          switch (command.type) {
            case 'LOGIN_ATTEMPT':
              ctx.body = { 
                token: 'jwt-token-would-go-here', 
                user: { 
                  id: processedEvent.userId,
                  email: processedEvent.email
                } 
              };
              break;
              
            case 'CREATE_TICKET':
              ctx.body = { 
                ticketId: processedEvent.ticketId,
                success: true 
              };
              break;
              
            case 'UPDATE_TICKET':
            case 'ADD_COMMENT':
            case 'ESCALATE_TICKET':
              ctx.body = { 
                success: true,
                ticketId: processedEvent.ticketId
              };
              break;
              
            case 'FETCH_DASHBOARD':
              ctx.body = { 
                success: true,
                dashboardRequested: true
              };
              break;
              
            default:
              ctx.body = { success: true };
          }
        })
        .catch(err => {
          ctx.status = 500;
          ctx.body = { 
            error: { 
              message: err.message,
              code: 'COMMAND_PROCESSING_ERROR'
            } 
          };
        });
    } catch (err) {
      ctx.status = 500;
      ctx.body = { 
        error: { 
          message: 'Unexpected error processing command',
          details: err.message,
          code: 'INTERNAL_SERVER_ERROR'
        } 
      };
    }
  });
  
  /**
   * GET /api/state/:userId - State reconstruction endpoint
   * Reconstructs current state for user based on event history
   */
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
          ctx.body = { 
            error: { 
              message: 'Failed to fetch state',
              details: err.message,
              code: 'STATE_FETCH_ERROR'
            } 
          };
        });
    } catch (err) {
      ctx.status = 500;
      ctx.body = { 
        error: { 
          message: 'Unexpected error reconstructing state',
          details: err.message,
          code: 'INTERNAL_SERVER_ERROR'
        } 
      };
    }
  });
  
  return router;
};
