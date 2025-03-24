/**
 * Pure command validator functions
 * No side effects, just validation logic
 */

// Validation result type
export const validateCommand = (command) => {
  // Check if command has the required base fields
  if (!hasRequiredBaseFields(command)) {
    return { 
      valid: false, 
      reason: 'Command must have type and userId fields' 
    };
  }

  // Validate based on command type
  switch (command.type) {
    case 'CREATE_TICKET':
      if (!isCreateTicketCommand(command)) {
        return { 
          valid: false, 
          reason: 'CREATE_TICKET command must have ticketDetails with subject and description' 
        };
      }
      break;
      
    case 'UPDATE_TICKET':
      if (!isUpdateTicketCommand(command)) {
        return { 
          valid: false, 
          reason: 'UPDATE_TICKET command must have ticketId and updates object' 
        };
      }
      break;
      
    case 'ADD_COMMENT':
      if (!isAddCommentCommand(command)) {
        return { 
          valid: false, 
          reason: 'ADD_COMMENT command must have ticketId and comment string' 
        };
      }
      break;
      
    case 'ESCALATE_TICKET':
      if (!isEscalateTicketCommand(command)) {
        return { 
          valid: false, 
          reason: 'ESCALATE_TICKET command must have ticketId' 
        };
      }
      break;
      
    case 'LOGIN_ATTEMPT':
      if (!isLoginAttemptCommand(command)) {
        return { 
          valid: false, 
          reason: 'LOGIN_ATTEMPT command must have email and password' 
        };
      }
      break;
      
    case 'FETCH_DASHBOARD':
      if (!isFetchDashboardCommand(command)) {
        return { 
          valid: false, 
          reason: 'FETCH_DASHBOARD command has invalid format' 
        };
      }
      break;
      
    default:
      return { 
        valid: false, 
        reason: `Unknown command type: ${command.type}` 
      };
  }

  return { valid: true };
};

// Type guard functions for command validation
const hasRequiredBaseFields = (command) => {
  return typeof command === 'object' && 
         command !== null && 
         typeof command.type === 'string' && 
         typeof command.userId === 'string';
};

const isCreateTicketCommand = (command) => {
  return command.type === 'CREATE_TICKET' && 
         typeof command.ticketDetails === 'object' && 
         command.ticketDetails !== null &&
         typeof command.ticketDetails.subject === 'string' &&
         typeof command.ticketDetails.description === 'string';
};

const isUpdateTicketCommand = (command) => {
  return command.type === 'UPDATE_TICKET' && 
         typeof command.ticketId === 'string' && 
         typeof command.updates === 'object' && 
         command.updates !== null;
};

const isAddCommentCommand = (command) => {
  return command.type === 'ADD_COMMENT' && 
         typeof command.ticketId === 'string' && 
         typeof command.comment === 'string';
};

const isEscalateTicketCommand = (command) => {
  return command.type === 'ESCALATE_TICKET' && 
         typeof command.ticketId === 'string';
};

const isLoginAttemptCommand = (command) => {
  return command.type === 'LOGIN_ATTEMPT' && 
         typeof command.email === 'string' && 
         typeof command.password === 'string';
};

const isFetchDashboardCommand = (command) => {
  return command.type === 'FETCH_DASHBOARD';
};
