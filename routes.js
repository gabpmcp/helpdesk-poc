import Router from '@koa/router';
import { fetchTicket, updateTicket, createTicket, addComment, escalateTicket } from './core.js';
import { authenticateUser, isAuthorized } from './auth.js';
import { fetchDashboardData } from './dashboard.js';

export const setupRoutes = (deps) => {
  const router = new Router();

  // --- Login ---
  router.post('/login', async (ctx) =>
    parseBody(ctx)
      .then(body => authenticateUser(deps.zohoClient)(body.email, body.password))
      .then(user => { ctx.body = user; })
      .catch(err => { ctx.status = 401; ctx.body = err; })
  )

  // --- Ticket CRUD ---
  router.get('/ticket/:id', (ctx) =>
    fetchTicket(deps.zohoClient)(ctx.params.id)
      .then(result => { ctx.body = result; })
      .catch(err => { ctx.status = 400; ctx.body = err; })
  )

  router.post('/ticket', async (ctx) =>
    parseBody(ctx)
      .then(body => createTicket(deps.zohoClient)(body))
      .then(result => { ctx.body = result; })
      .catch(err => { ctx.status = 400; ctx.body = err; })
  )

  router.put('/ticket/:id/comment', async (ctx) =>
    parseBody(ctx)
      .then(body => addComment(deps.zohoClient)(ctx.params.id, body.comment))
      .then(result => { ctx.body = result; })
      .catch(err => { ctx.status = 400; ctx.body = err; })
  )

  router.put('/ticket/:id/escalate', (ctx) =>
    escalateTicket(deps.zohoClient)(ctx.params.id)
      .then(result => { ctx.body = result; })
      .catch(err => { ctx.status = 400; ctx.body = err; })
  )

  // --- Dashboard ---
  router.get('/dashboard/:contactId', (ctx) =>
    fetchDashboardData(deps.zohoClient)(ctx.params.contactId)
      .then(result => { ctx.body = result; })
      .catch(err => { ctx.status = 400; ctx.body = err; })
  )

  return router.routes()
}

const parseBody = (ctx) =>
  new Promise((resolve) => {
    const accumulateChunks = (chunks = []) => {
      ctx.req.once('data', (chunk) => accumulateChunks([...chunks, chunk]));
      ctx.req.once('end', () =>
        resolve(
          chunks.length
            ? JSON.parse(Buffer.concat(chunks).toString())
            : {}
        )
      )
    }
    accumulateChunks()
  })