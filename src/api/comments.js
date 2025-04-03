/**
 * Rutas para la gestión de comentarios - Parte del Imperative Shell
 */
import Router from '@koa/router';
import { addCommentToTicket } from '../services/comments/addComment.js';

const router = new Router();

/**
 * Ruta para agregar un comentario a un ticket
 * Implementado como adaptador imperativo que utiliza funciones puras
 */
router.post('/api/tickets/:ticketId/comments', (ctx) => {
  console.log('[API] Añadiendo comentario al ticket:', ctx.params.ticketId);
  
  // Usando la función pura addCommentToTicket con la dependencia fetch inyectada
  return addCommentToTicket(fetch)({
    ticketId: ctx.params.ticketId,
    comment: ctx.request.body.comment,
  })
    .then((comment) => { 
      console.log('[API] Comentario añadido correctamente:', comment);
      ctx.body = comment; 
    })
    .catch(({ status, message }) => {
      console.error('[API] Error al añadir comentario:', message);
      ctx.status = status || 500;
      ctx.body = { error: message || 'Error al añadir comentario' };
    });
});

export default router;
