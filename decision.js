/**
 * Pure transition function that handles all business logic
 * Takes commands and returns events with no side effects
 */
import { v4 as generateUUID } from 'uuid';

/**
 * Pure transition function that converts commands to events
 * No side effects, just pure business logic
 */
export const transition = (command) => {
  // Ensure timestamp is set
  const timestamp = command.timestamp || Date.now();
  
  switch (command.type) {
    case 'CREATE_TICKET':
      return {
        type: 'TICKET_CREATED',
        userId: command.userId,
        ticketId: generateUUID(),
        details: command.ticketDetails,
        timestamp
      };
      
    case 'UPDATE_TICKET':
      return {
        type: 'TICKET_UPDATED',
        userId: command.userId,
        ticketId: command.ticketId,
        updates: command.updates,
        timestamp
      };
      
    case 'ADD_COMMENT':
      return {
        type: 'COMMENT_ADDED',
        userId: command.userId,
        ticketId: command.ticketId,
        commentId: generateUUID(),
        comment: command.comment,
        timestamp
      };
      
    case 'ESCALATE_TICKET':
      return {
        type: 'TICKET_ESCALATED',
        userId: command.userId,
        ticketId: command.ticketId,
        timestamp
      };
      
    case 'LOGIN_ATTEMPT':
      // Note: In a real implementation, we would validate credentials here
      // For this example, we'll simulate a successful login
      // The actual authentication would happen in the notification layer
      return {
        type: 'LOGIN_SUCCEEDED',
        userId: command.userId,
        email: command.email,
        userDetails: {
          email: command.email,
          role: 'Standard'
        },
        timestamp
      };
      
    case 'FETCH_DASHBOARD':
      // Note: This is a read operation that would be handled differently
      // in a real implementation. For simplicity, we're treating it as an event.
      return {
        type: 'DASHBOARD_FETCHED',
        userId: command.userId,
        dashboardData: {}, // This would be populated by the notification layer
        timestamp
      };
      
    default:
      return {
        type: 'COMMAND_REJECTED',
        userId: command.userId,
        commandType: command.type,
        reason: 'Unknown command type',
        timestamp
      };
  }
};

/**
 * Pure function to apply events to state
 * Reconstructs state from a sequence of events
 */
export const applyEvent = (state, event) => {
  switch (event.type) {
    case 'TICKET_CREATED':
      return {
        ...state,
        tickets: [...(state.tickets || []), {
          id: event.ticketId,
          ...event.details
        }]
      };
      
    case 'TICKET_UPDATED':
      return {
        ...state,
        tickets: (state.tickets || []).map(ticket => 
          ticket.id === event.ticketId 
            ? { ...ticket, ...event.updates } 
            : ticket
        )
      };
      
    case 'COMMENT_ADDED':
      return {
        ...state,
        tickets: (state.tickets || []).map(ticket => {
          if (ticket.id === event.ticketId) {
            const comments = ticket.comments || [];
            return {
              ...ticket,
              comments: [...comments, {
                id: event.commentId,
                content: event.comment,
                userId: event.userId,
                timestamp: event.timestamp
              }]
            };
          }
          return ticket;
        })
      };
      
    case 'TICKET_ESCALATED':
      return {
        ...state,
        tickets: (state.tickets || []).map(ticket => 
          ticket.id === event.ticketId 
            ? { ...ticket, priority: 'High' } 
            : ticket
        )
      };
      
    case 'LOGIN_SUCCEEDED':
      return {
        ...state,
        user: {
          id: event.userId,
          email: event.email,
          ...event.userDetails
        },
        isAuthenticated: true,
        lastLogin: event.timestamp
      };
      
    case 'LOGIN_FAILED':
      return {
        ...state,
        loginErrors: [...(state.loginErrors || []), {
          timestamp: event.timestamp,
          email: event.email,
          reason: event.reason
        }]
      };
      
    case 'DASHBOARD_FETCHED':
      return {
        ...state,
        dashboard: {
          ...event.dashboardData,
          lastFetched: event.timestamp
        }
      };
      
    default:
      return state;
  }
};

// Initial state for state reconstruction
export const initialState = {
  tickets: [],
  user: null,
  isAuthenticated: false,
  loginErrors: [],
  dashboard: null
};
