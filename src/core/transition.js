/**
 * Pure transition function that handles all business logic
 * Takes commands and returns events with no side effects
 */
import { v4 as generateUUID } from 'uuid';
import { Result, deepFreeze } from '../utils/functional.js';

/**
 * Pure transition function that converts commands to events
 * No side effects, just pure business logic
 * Returns a Result type with either success or error events
 */
export const transition = (command, eventHistory = [], timestamp) => {
  // Ensure timestamp is set with immutable pattern
  const eventTimestamp = timestamp || command.timestamp || Date.now();
  
  // Create event based on command type
  const event = createEventFromCommand(command, eventTimestamp, eventHistory);
  
  // Freeze the event to enforce immutability
  return Result.ok(deepFreeze(event));
};

/**
 * Pure function to create an event from a command
 * No side effects, just pure data transformation
 */
const createEventFromCommand = (command, timestamp, eventHistory) => {
  switch (command.type) {
    case 'LOGIN_ATTEMPT':
      return {
        type: 'LOGIN_REQUESTED',
        userId: command.userId,
        email: command.email,
        password: command.password, // Include password for validation in shell
        timestamp
      };
      
    case 'REFRESH_TOKEN':
      // Perform preliminary validation based on event history
      const validationResult = validateRefreshTokenFromHistory(command.userId, command.refreshToken, eventHistory);
      
      return validationResult.isValid
        ? {
            type: 'REFRESH_TOKEN_VALIDATED',
            userId: command.userId,
            refreshToken: command.refreshToken,
            timestamp
          }
        : {
            type: 'INVALID_REFRESH_TOKEN',
            userId: command.userId,
            reason: validationResult.reason,
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
 * Pure function to validate a refresh token from event history
 * Performs preliminary validation based on event history
 * Cryptographic verification is deferred to the shell layer
 * Returns an immutable validation result object
 */
const validateRefreshTokenFromHistory = (userId, refreshToken, eventHistory) => {
  // If no event history is provided, we can't validate the token
  if (!eventHistory || !Array.isArray(eventHistory) || eventHistory.length === 0) {
    return deepFreeze({ isValid: false, reason: 'Token not found' });
  }
  
  // Find all token-related events for this user
  const relevantEvents = eventHistory
    .filter(event => 
      event.userId === userId && 
      (event.type === 'LOGIN_SUCCEEDED' || 
       event.type === 'TOKEN_REFRESHED' || 
       event.type === 'INVALID_REFRESH_TOKEN')
    )
    .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending (newest first)
  
  // If no relevant events found, token is invalid
  if (relevantEvents.length === 0) {
    return deepFreeze({ isValid: false, reason: 'Token not found' });
  }
  
  // Check if the token has been revoked or invalidated
  const tokenInvalidationEvents = relevantEvents.filter(event => 
    event.type === 'INVALID_REFRESH_TOKEN' && 
    event.refreshToken === refreshToken
  );
  
  if (tokenInvalidationEvents.length > 0) {
    return deepFreeze({ isValid: false, reason: 'Token has been invalidated' });
  }
  
  // Find the most recent token issuance event
  const tokenIssuanceEvents = relevantEvents.filter(event => 
    event.type === 'LOGIN_SUCCEEDED' || event.type === 'TOKEN_REFRESHED'
  );
  
  if (tokenIssuanceEvents.length === 0) {
    return deepFreeze({ isValid: false, reason: 'Token not found' });
  }
  
  // Check if the provided refresh token matches any issued token
  // Note: In a real implementation with single-use tokens, we would check if the token has been used
  // For this POC, we just check if the token exists in the event history
  const matchingTokenEvent = tokenIssuanceEvents.find(event => {
    const eventToken = event.type === 'LOGIN_SUCCEEDED' 
      ? event.refreshToken 
      : event.newRefreshToken;
    
    return eventToken === refreshToken;
  });
  
  if (!matchingTokenEvent) {
    return deepFreeze({ isValid: false, reason: 'Token not found' });
  }
  
  // If we reach here, the token exists in the event history
  // Cryptographic verification and expiration check will be done in the shell layer
  return deepFreeze({ isValid: true });
};

/**
 * Pure function to apply events to state
 * Reconstructs state from a sequence of events
 * Always returns a new state object, never mutates the input state
 */
export const applyEvent = (state, event) => {
  switch (event.type) {
    case 'LOGIN_SUCCEEDED':
      return deepFreeze({
        ...state,
        user: {
          id: event.userId,
          email: event.email,
          lastLogin: event.timestamp,
          accessToken: event.accessToken,
          refreshToken: event.refreshToken
        }
      });
      
    case 'REFRESH_TOKEN_VALIDATED':
      // This is an intermediate event and doesn't change the state
      return state;
      
    case 'TOKEN_REFRESHED':
      return deepFreeze({
        ...state,
        user: {
          ...state.user,
          accessToken: event.newAccessToken,
          refreshToken: event.newRefreshToken,
          lastTokenRefresh: event.issuedAt
        }
      });
      
    case 'INVALID_REFRESH_TOKEN':
      // This doesn't change the state, but we might want to track failed attempts
      return state;
      
    case 'TICKET_CREATED':
      return deepFreeze({
        ...state,
        tickets: [
          ...state.tickets,
          {
            id: event.ticketId,
            userId: event.userId,
            details: event.details,
            status: 'Open',
            createdAt: event.timestamp,
            comments: []
          }
        ]
      });
      
    case 'TICKET_UPDATED':
      return deepFreeze({
        ...state,
        tickets: state.tickets.map(ticket => 
          ticket.id === event.ticketId
            ? { ...ticket, ...event.updates, updatedAt: event.timestamp }
            : ticket
        )
      });
      
    case 'COMMENT_ADDED':
      return deepFreeze({
        ...state,
        tickets: state.tickets.map(ticket => 
          ticket.id === event.ticketId
            ? {
                ...ticket,
                comments: [
                  ...ticket.comments,
                  {
                    id: event.commentId,
                    userId: event.userId,
                    text: event.comment,
                    timestamp: event.timestamp
                  }
                ]
              }
            : ticket
        )
      });
      
    case 'TICKET_ESCALATED':
      return deepFreeze({
        ...state,
        tickets: state.tickets.map(ticket => 
          ticket.id === event.ticketId
            ? {
                ...ticket,
                priority: 'High',
                escalatedAt: event.timestamp
              }
            : ticket
        )
      });
      
    default:
      return state;
  }
};

// Initial state for state reconstruction
export const initialState = deepFreeze({
  tickets: [],
  user: null,
  dashboard: {
    recentTickets: [],
    ticketStats: {
      open: 0,
      pending: 0,
      resolved: 0,
      closed: 0
    }
  }
});
