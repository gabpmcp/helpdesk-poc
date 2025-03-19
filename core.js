export const fetchTicket = (client) => (ticketId) =>
    /^[0-9]+$/.test(ticketId)
      ? client.get(`/tickets/${ticketId}`).then(data => ({ ticket: data }))
      : Promise.reject({ type: 'INVALID_ID', details: ticketId })
  
  export const updateTicket = (client) => (ticketId, updates) =>
    /^[0-9]+$/.test(ticketId)
      ? client.put(`/tickets/${ticketId}`, updates).then(() => ({ success: true }))
      : Promise.reject({ type: 'INVALID_ID', details: ticketId })
  
  export const createTicket = (client) => (payload) =>
    client.post('/tickets', payload)
      .then(data => ({ ticketCreated: data }))
      .catch(err => Promise.reject({ type: 'CREATE_TICKET_ERROR', details: err }))
  
  export const addComment = (client) => (ticketId, comment) =>
    client.post(`/tickets/${ticketId}/comments`, { content: comment })
      .then(() => ({ commentAdded: true }))
      .catch(err => Promise.reject({ type: 'ADD_COMMENT_ERROR', details: err }))
  
  export const escalateTicket = (client) => (ticketId) =>
    client.put(`/tickets/${ticketId}`, { priority: 'High' })
      .then(() => ({ escalated: true }))
      .catch(err => Promise.reject({ type: 'ESCALATE_ERROR', details: err }))