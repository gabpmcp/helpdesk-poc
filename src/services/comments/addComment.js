/**
 * Servicio de comentarios - FCIS compliant
 * Functional, Composable, Isolated, Stateless
 */

/**
 * Función pura para agregar un comentario a un ticket
 * @param {Function} fetchFn - Función para realizar peticiones HTTP
 * @returns {Function} - Función curried que acepta datos de comentario
 */
export const addCommentToTicket = (fetchFn) => ({ ticketId, comment }) => {
  // Validación funcional (sin efectos secundarios)
  if (!ticketId || !comment) {
    return Promise.reject({ 
      error: true, 
      message: 'Se requieren ticketId y comment',
      status: 400 
    });
  }
  
  // Construcción de la URL (sin dependencias externas)
  const n8nBaseUrl = process.env.N8N_BASE_URL || 'https://n8n.advancio.io/webhook/';
  const addCommentWebhook = 'zoho-add-comment';
  const url = `${n8nBaseUrl}${addCommentWebhook}`;
  
  // Pipeline con promesas
  return fetchFn(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ 
      ticketId, 
      comment
    })
  }).then(res => 
    res.ok 
      ? res.json()
      : Promise.reject({ 
          error: true, 
          status: res.status,
          message: `Error al añadir comentario: ${res.statusText}`
        })
  );
};
