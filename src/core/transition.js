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
    case 'LOGIN_ATTEMPT':
      return {
        type: 'LOGIN_SUCCEEDED',
        userId: command.userId,
        email: command.email,
        timestamp
      };
      
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
      
    case 'FETCH_DASHBOARD':
      return {
        type: 'DASHBOARD_REQUESTED',
        userId: command.userId,
        timestamp
      };
      
    default:
      return { 
        type: 'COMMAND_REJECTED', 
        reason: 'Unknown command type',
        originalCommand: command.type,
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
    case 'LOGIN_SUCCEEDED':
      return {
        ...state,
        user: {
          id: event.userId,
          email: event.email,
          lastLogin: event.timestamp
        }
      };
      
    case 'TICKET_CREATED':
      return {
        ...state,
        tickets: [
          ...state.tickets,
          {
            id: event.ticketId,
            subject: event.details.subject,
            description: event.details.description,
            status: 'Open',
            priority: event.details.priority || 'Medium',
            createdAt: event.timestamp,
            updatedAt: event.timestamp,
            comments: []
          }
        ]
      };
      
    case 'TICKET_UPDATED':
      return {
        ...state,
        tickets: state.tickets.map(ticket => 
          ticket.id === event.ticketId
            ? { 
                ...ticket, 
                ...event.updates,
                updatedAt: event.timestamp
              }
            : ticket
        )
      };
      
    case 'COMMENT_ADDED':
      return {
        ...state,
        tickets: state.tickets.map(ticket => 
          ticket.id === event.ticketId
            ? { 
                ...ticket, 
                updatedAt: event.timestamp,
                comments: [
                  ...ticket.comments,
                  {
                    id: event.commentId,
                    content: event.comment,
                    createdAt: event.timestamp,
                    createdBy: event.userId
                  }
                ]
              }
            : ticket
        )
      };
      
    case 'TICKET_ESCALATED':
      return {
        ...state,
        tickets: state.tickets.map(ticket => 
          ticket.id === event.ticketId
            ? { 
                ...ticket, 
                priority: 'High',
                updatedAt: event.timestamp,
                escalatedAt: event.timestamp
              }
            : ticket
        )
      };
      
    default:
      return state;
  }
};

// Initial state for state reconstruction
export const initialState = {
  tickets: [],
  user: null,
  dashboardData: {
    openTickets: 0,
    closedTickets: 0,
    highPriorityTickets: 0
  }
};
