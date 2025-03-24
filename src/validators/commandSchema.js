/**
 * Command validation schemas using Zod
 * Pure validation functions with no side effects
 */
import { z } from 'zod';

/**
 * Base command schema that all commands must satisfy
 */
export const baseCommandSchema = z.object({
  type: z.string(),
  userId: z.string(),
  timestamp: z.number().optional().default(() => Date.now())
});

/**
 * Login attempt command schema
 */
export const loginAttemptSchema = baseCommandSchema.extend({
  type: z.literal('LOGIN_ATTEMPT'),
  email: z.string().email(),
  password: z.string()
});

/**
 * Create ticket command schema
 */
export const createTicketSchema = baseCommandSchema.extend({
  type: z.literal('CREATE_TICKET'),
  ticketDetails: z.object({
    subject: z.string().min(1, "Subject is required"),
    description: z.string().min(1, "Description is required"),
    departmentId: z.string().optional(),
    priority: z.enum(['Low', 'Medium', 'High']).optional().default('Medium')
  })
});

/**
 * Update ticket command schema
 */
export const updateTicketSchema = baseCommandSchema.extend({
  type: z.literal('UPDATE_TICKET'),
  ticketId: z.string().uuid(),
  updates: z.object({
    subject: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['Open', 'Pending', 'Resolved', 'Closed']).optional(),
    priority: z.enum(['Low', 'Medium', 'High']).optional()
  })
});

/**
 * Add comment command schema
 */
export const addCommentSchema = baseCommandSchema.extend({
  type: z.literal('ADD_COMMENT'),
  ticketId: z.string().uuid(),
  comment: z.string().min(1, "Comment cannot be empty")
});

/**
 * Escalate ticket command schema
 */
export const escalateTicketSchema = baseCommandSchema.extend({
  type: z.literal('ESCALATE_TICKET'),
  ticketId: z.string().uuid()
});

/**
 * Fetch dashboard command schema
 */
export const fetchDashboardSchema = baseCommandSchema.extend({
  type: z.literal('FETCH_DASHBOARD')
});

/**
 * Validates a command based on its type
 * Returns a result object with success flag and data/error
 */
export const validateCommand = (command) => {
  if (!command || typeof command !== 'object' || !command.type) {
    return { 
      success: false, 
      error: { message: 'Invalid command format' } 
    };
  }

  switch (command.type) {
    case 'LOGIN_ATTEMPT':
      return loginAttemptSchema.safeParse(command);
      
    case 'CREATE_TICKET':
      return createTicketSchema.safeParse(command);
      
    case 'UPDATE_TICKET':
      return updateTicketSchema.safeParse(command);
      
    case 'ADD_COMMENT':
      return addCommentSchema.safeParse(command);
      
    case 'ESCALATE_TICKET':
      return escalateTicketSchema.safeParse(command);
      
    case 'FETCH_DASHBOARD':
      return fetchDashboardSchema.safeParse(command);
      
    default:
      return { 
        success: false, 
        error: { 
          message: 'Unknown command type',
          details: { type: command.type } 
        } 
      };
  }
};
