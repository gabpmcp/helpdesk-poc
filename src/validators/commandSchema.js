/**
 * Command validation schemas using Zod
 * Pure validation functions with no side effects
 */
import { z } from 'zod';
import { Result, deepFreeze } from '../utils/functional.js';

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
 * Refresh token command schema
 */
export const refreshTokenSchema = baseCommandSchema.extend({
  type: z.literal('REFRESH_TOKEN'),
  refreshToken: z.string().min(1, "Refresh token is required")
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
 * Maps a Zod validation result to our Result type
 * @param {Object} zodResult - Result from Zod's safeParse
 * @returns {Object} A Result object
 */
const mapZodResultToResult = (zodResult) => {
  if (zodResult.success) {
    return Result.ok(deepFreeze(zodResult.data));
  } else {
    return Result.error(deepFreeze({
      message: 'Validation error',
      details: zodResult.error.format()
    }));
  }
};

/**
 * Validates a command based on its type
 * Returns a Result object with success or error
 */
export const validateCommand = (command) => {
  // Early validation for null/undefined or non-object commands
  if (!command || typeof command !== 'object') {
    return Result.error(deepFreeze({
      message: 'Invalid command format',
      details: { received: typeof command }
    }));
  }
  
  // Early validation for missing type
  if (!command.type) {
    return Result.error(deepFreeze({
      message: 'Missing command type',
      details: { received: command }
    }));
  }

  // Validate based on command type
  const validationResult = validateByCommandType(command);
  
  // Return the result (already frozen by mapZodResultToResult)
  return validationResult;
};

/**
 * Pure function to validate a command by its type
 * @param {Object} command - The command to validate
 * @returns {Object} A Result object
 */
const validateByCommandType = (command) => {
  switch (command.type) {
    case 'LOGIN_ATTEMPT':
      return mapZodResultToResult(loginAttemptSchema.safeParse(command));
      
    case 'REFRESH_TOKEN':
      return mapZodResultToResult(refreshTokenSchema.safeParse(command));
      
    case 'CREATE_TICKET':
      return mapZodResultToResult(createTicketSchema.safeParse(command));
      
    case 'UPDATE_TICKET':
      return mapZodResultToResult(updateTicketSchema.safeParse(command));
      
    case 'ADD_COMMENT':
      return mapZodResultToResult(addCommentSchema.safeParse(command));
      
    case 'ESCALATE_TICKET':
      return mapZodResultToResult(escalateTicketSchema.safeParse(command));
      
    case 'FETCH_DASHBOARD':
      return mapZodResultToResult(fetchDashboardSchema.safeParse(command));
      
    default:
      return Result.error(deepFreeze({
        message: 'Unknown command type',
        details: { type: command.type }
      }));
  }
};
