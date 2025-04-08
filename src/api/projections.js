/**
 * Projection API endpoints - FCIS pattern compliant
 * Functional, Composable, Isolated, Stateless
 * 
 * These endpoints provide immutable projections of data from external sources
 * following functional programming principles
 */
import Router from '@koa/router';
import { Result, deepFreeze, pipe } from '../utils/functional.js';
import * as projectionService from '../services/projectionService.js';

/**
 * Pure function to handle API responses
 * @param {Result} result - Result object from service
 * @param {Object} ctx - Koa context
 * @returns {void}
 */
const handleResponse = (result, ctx) => {
  if (result.isOk) {
    ctx.body = result.unwrap();
    ctx.status = 200;
  } else {
    ctx.body = deepFreeze({
      error: result.unwrapError().message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
    ctx.status = 500;
  }
};

/**
 * Pure function to create a handler for projection endpoints
 * @param {Function} projectionFn - Function that returns a Result
 * @returns {Function} - Koa handler function
 */
const createProjectionHandler = (projectionFn) => async (ctx) => {
  try {
    const result = await projectionFn();
    handleResponse(result, ctx);
  } catch (error) {
    ctx.body = deepFreeze({
      error: error.message || 'Unknown error',
      timestamp: new Date().toISOString()
    });
    ctx.status = 500;
  }
};

/**
 * Setup projection routes
 * @returns {Router} - Configured router
 */
export const setupProjectionRoutes = () => {
  const router = new Router({
    prefix: '/projections'
  });

  // Dashboard overview projection
  router.get('/dashboard/overview', createProjectionHandler(projectionService.getDashboardOverview));
  
  // New endpoint for general overview using the new n8n workflow
  router.get('/overview', createProjectionHandler(projectionService.getReportsOverview));
  
  // Dashboard tickets projection
  router.get('/dashboard/tickets', createProjectionHandler(projectionService.getDashboardTickets));
  
  // Dashboard contacts projection
  router.get('/dashboard/contacts', createProjectionHandler(projectionService.getDashboardContacts));

  return router;
};

/**
 * Setup webhook routes
 * @returns {Router} - Configured router
 */
export const setupWebhookRoutes = () => {
  const router = new Router({
    prefix: '/webhook'
  });

  // Zoho reports overview webhook
  router.get('/zoho/reports-overview', createProjectionHandler(projectionService.getReportsOverview));

  return router;
};

/**
 * Setup API routes for Zoho integration
 * @returns {Router} - Configured router
 */
export const setupZohoApiRoutes = () => {
  const router = new Router({
    prefix: '/api/zoho'
  });

  // Zoho reports overview API
  router.get('/reports-overview', createProjectionHandler(projectionService.getReportsOverview));
  
  // Zoho tickets API
  router.get('/tickets', createProjectionHandler(projectionService.getDashboardTickets));
  
  // Zoho contacts API
  router.get('/contacts', createProjectionHandler(projectionService.getDashboardContacts));

  return router;
};

/**
 * Setup dashboard routes
 * @returns {Router} - Configured router
 */
export const setupDashboardRoutes = () => {
  const router = new Router({
    prefix: '/dashboard'
  });

  // Unified dashboard endpoint
  router.get('/', async (ctx) => {
    try {
      const reportsResult = await projectionService.getReportsOverview();
      
      if (reportsResult.isOk) {
        ctx.body = reportsResult.unwrap();
        ctx.status = 200;
      } else {
        ctx.body = deepFreeze({
          error: reportsResult.unwrapError().message || 'Failed to fetch dashboard data',
          timestamp: new Date().toISOString()
        });
        ctx.status = 500;
      }
    } catch (error) {
      ctx.body = deepFreeze({
        error: error.message || 'Unknown error',
        timestamp: new Date().toISOString()
      });
      ctx.status = 500;
    }
  });

  return router;
};
