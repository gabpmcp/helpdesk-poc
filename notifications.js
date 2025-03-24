/**
 * Notification handler for external services
 * This is part of the imperative shell that handles side effects
 */

/**
 * Handles external notifications based on events
 * Isolates all side effects to this layer
 */
export const notifyExternal = (event, { zohoClient }) => {
  switch (event.type) {
    case 'TICKET_CREATED':
      return zohoClient.post('/tickets', {
        subject: event.details.subject,
        description: event.details.description,
        departmentId: event.details.departmentId,
        priority: event.details.priority || 'Medium',
        contactId: event.userId
      }).then(response => ({
        ...event,
        externalId: response.id,
        externalData: response
      }));
      
    case 'TICKET_UPDATED':
      return zohoClient.put(`/tickets/${event.ticketId}`, event.updates)
        .then(response => ({
          ...event,
          externalData: response
        }));
      
    case 'COMMENT_ADDED':
      return zohoClient.post(`/tickets/${event.ticketId}/comments`, {
        content: event.comment
      }).then(response => ({
        ...event,
        externalId: response.id,
        externalData: response
      }));
      
    case 'TICKET_ESCALATED':
      return zohoClient.put(`/tickets/${event.ticketId}`, {
        priority: 'High'
      }).then(response => ({
        ...event,
        externalData: response
      }));
      
    case 'LOGIN_SUCCEEDED':
      // In a real implementation, this might validate the user with Zoho
      // or perform other login-related actions
      return Promise.resolve(event);
      
    case 'DASHBOARD_FETCHED':
      // Fetch dashboard data from Zoho
      return zohoClient.get(`/contacts/${event.userId}/tickets`)
        .then(tickets => {
          // Calculate stats
          const stats = {
            open: tickets.filter(t => t.status === 'Open').length,
            closed: tickets.filter(t => t.status === 'Closed').length,
            highPriority: tickets.filter(t => t.priority === 'High').length
          };
          
          return {
            ...event,
            dashboardData: {
              tickets,
              stats
            }
          };
        });
      
    default:
      // No external notification needed
      return Promise.resolve(event);
  }
};
