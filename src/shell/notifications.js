/**
 * Handles side-effects based on events
 * Part of the imperative shell
 */

/**
 * Notifies external systems based on event type
 * This is where all side effects happen
 */
export const notifyExternal = (event, { zohoClient, supabaseClient }) => {
  switch (event.type) {
    case 'TICKET_CREATED':
      return handleTicketCreated(event, zohoClient);
      
    case 'TICKET_UPDATED':
      return handleTicketUpdated(event, zohoClient);
      
    case 'COMMENT_ADDED':
      return handleCommentAdded(event, zohoClient);
      
    case 'TICKET_ESCALATED':
      return handleTicketEscalated(event, zohoClient);
      
    case 'LOGIN_SUCCEEDED':
      return handleLoginSucceeded(event, supabaseClient);
      
    default:
      return Promise.resolve(event);
  }
};

/**
 * Handles ticket creation in Zoho
 */
const handleTicketCreated = (event, zohoClient) => {
  const { details } = event;
  
  return zohoClient.post('/tickets', {
    subject: details.subject,
    description: details.description,
    departmentId: details.departmentId,
    priority: details.priority || 'Medium',
    contactId: event.userId,
  })
  .then(response => {
    // Enrich event with external system data
    return {
      ...event,
      externalTicketId: response.id,
      externalTicketUrl: response.ticketUrl
    };
  })
  .catch(error => {
    console.error('Failed to create ticket in Zoho:', error);
    return event; // Return original event on error
  });
};

/**
 * Handles ticket updates in Zoho
 */
const handleTicketUpdated = (event, zohoClient) => {
  const { ticketId, updates } = event;
  
  return zohoClient.put(`/tickets/${ticketId}`, updates)
    .then(() => event)
    .catch(error => {
      console.error('Failed to update ticket in Zoho:', error);
      return event;
    });
};

/**
 * Handles adding comments to tickets in Zoho
 */
const handleCommentAdded = (event, zohoClient) => {
  const { ticketId, comment } = event;
  
  return zohoClient.post(`/tickets/${ticketId}/comments`, {
    content: comment,
    isPublic: true
  })
    .then(() => event)
    .catch(error => {
      console.error('Failed to add comment in Zoho:', error);
      return event;
    });
};

/**
 * Handles ticket escalation in Zoho
 */
const handleTicketEscalated = (event, zohoClient) => {
  const { ticketId } = event;
  
  return zohoClient.put(`/tickets/${ticketId}`, {
    priority: 'High'
  })
    .then(() => event)
    .catch(error => {
      console.error('Failed to escalate ticket in Zoho:', error);
      return event;
    });
};

/**
 * Handles successful login events
 */
const handleLoginSucceeded = (event, supabaseClient) => {
  // Record login activity in Supabase
  return supabaseClient
    .from('user_activity')
    .insert([{
      user_id: event.userId,
      activity_type: 'LOGIN',
      timestamp: event.timestamp
    }])
    .then(() => event)
    .catch(error => {
      console.error('Failed to record login activity:', error);
      return event;
    });
};
