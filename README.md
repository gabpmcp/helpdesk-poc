# Helpdesk POC - FCIS Architecture with Event Sourcing

This project implements a helpdesk API following Functional Core, Imperative Shell (FCIS) principles and Event Sourcing. The architecture maintains a clear separation between pure business logic (without side effects) and operations with side effects.

## Design Principles

- **Functional Core**: All business logic is implemented in pure functions without side effects.
- **Imperative Shell**: Interactions with external services (Zoho, Supabase) are isolated in the shell layer.
- **Event Sourcing**: The system state is reconstructed from a sequence of stored events.
- **Immutability**: No mutable data structures or mutable control flows are used.
- **Functional Error Handling**: Errors are represented as values using the Result type pattern, not exceptions.
- **Pure Functions**: Functions have no side effects, always return the same output for the same input.
- **Aggregate Identification**: Email is used as the aggregate identifier throughout the system.

## Project Structure

```
/src
├── /core
│    └── transition.js             # Pure transition function (command → event)
├── /validators
│    └── commandSchema.js          # JSON schema definitions & validation logic
├── /shell
│    ├── config.js                 # External clients setup (Supabase, Zoho)
│    ├── eventStore.js             # Supabase interaction: store & fetch events
│    └── notifications.js          # Handles side-effects based on events
├── /api
│    └── index.js                  # Define /api/commands and /api/state/:email
├── /utils
│    └── functional.js             # Functional programming utilities
└── index.js                       # Glue file (wires together server & shell)
/migrations
└── 001_create_events_table.sql    # Database schema for Event Sourcing
```

## Endpoints

### FCIS Endpoints

- **POST /api/commands**: Centralized endpoint to receive commands from the frontend.
- **GET /api/state/:email**: Endpoint to reconstruct user state from events.

## Data Flow

1. The frontend sends commands to the `/api/commands` endpoint.
2. The backend validates the command using pure validation functions, returning a Result.
3. If the command is valid, an event is generated using the pure transition function, returning a Result.
4. The event is stored in Supabase (side effect in the shell layer).
5. External services like Zoho are notified (side effect in the shell layer).
6. The frontend can reconstruct the user's state by querying `/api/state/:email`.

## Command Types

- `LOGIN_ATTEMPT`: User login
- `REFRESH_TOKEN`: Refresh authentication tokens
- `CREATE_TICKET`: Create a new ticket
- `UPDATE_TICKET`: Update an existing ticket
- `ADD_COMMENT`: Add a comment to a ticket
- `ESCALATE_TICKET`: Escalate ticket priority
- `FETCH_DASHBOARD`: Request dashboard data

## Event Types

- `LOGIN_SUCCEEDED`: User login successful
- `REFRESH_TOKEN_VALIDATED`: Refresh token preliminarily validated by core
- `TOKEN_REFRESHED`: Authentication tokens refreshed successfully
- `INVALID_REFRESH_TOKEN`: Refresh token validation failed
- `TICKET_CREATED`: New ticket created
- `TICKET_UPDATED`: Existing ticket updated
- `COMMENT_ADDED`: Comment added to ticket
- `TICKET_ESCALATED`: Ticket priority escalated
- `DASHBOARD_REQUESTED`: Dashboard data requested

## Authentication Flow

### Login Flow
1. Frontend sends `LOGIN_ATTEMPT` command
2. Backend validates credentials and generates `LOGIN_SUCCEEDED` event
3. Shell layer generates JWT tokens (access and refresh)
4. Tokens are returned to the frontend

### Token Refresh Flow
1. Frontend sends `REFRESH_TOKEN` command with existing refresh token
2. Core layer performs preliminary validation based on event history:
   - Checks if token exists in event history
   - Checks if token has been invalidated
3. If preliminarily valid, core emits `REFRESH_TOKEN_VALIDATED` event
4. Shell layer performs cryptographic verification:
   - Verifies JWT signature
   - Checks token expiration
   - Validates token belongs to user
5. If valid, shell generates `TOKEN_REFRESHED` event with new tokens
6. If invalid, shell generates `INVALID_REFRESH_TOKEN` event with reason
7. New tokens are returned to the frontend if successful

## JWT Token Implementation

- **Access Token**: Short-lived token (1 hour) for API access
- **Refresh Token**: Longer-lived token (7 days) for obtaining new access tokens
- **Token Verification**:
  - Signature verification using JWT_SECRET
  - Expiration time validation
  - Token type validation (access vs refresh)
  - Email validation

## Database Setup

The application uses Supabase as the event store for the Event Sourcing pattern. The database schema is defined in SQL migration files in the `/migrations` directory.

### Database Schema

1. **events**: Main event store table
   - `id`: UUID primary key
   - `email`: Email of the user associated with the event (aggregate identifier)
   - `type`: Event type (e.g., LOGIN_SUCCEEDED, TOKEN_REFRESHED)
   - `payload`: JSONB containing event-specific data
   - `created_at`: Timestamp when the event was created

2. **user_activity**: Tracks user login and token refresh activities
   - `id`: UUID primary key
   - `email`: Email of the user (aggregate identifier)
   - `activity_type`: Type of activity (e.g., LOGIN, TOKEN_REFRESH)
   - `timestamp`: Unix timestamp of the activity
   - `created_at`: Timestamp when the record was created

### Security

The database uses Supabase Row Level Security (RLS) to ensure:
- Users can only read events associated with their own email
- Only the backend service can write events (using the service key)

### Applying Migrations

To set up the database schema in your Supabase project:

1. Log in to the [Supabase Dashboard](https://supabase.com/dashboard/project/mydadsjsnozkthqhloga)
2. Navigate to the SQL Editor
3. Copy the contents of `/migrations/001_create_events_table.sql`
4. Paste into the SQL Editor and run the query

Alternatively, you can use the provided migration script:

```bash
# Install dependencies if needed
npm install

# Set environment variables in .env file
# SUPABASE_URL=your_supabase_url
# SUPABASE_SERVICE_KEY=your_service_key

# Run migrations
node run-migrations.js
```

## Environment Variables

```
ZOHO_AUTH_TOKEN=zoho_authentication_token
ZOHO_BASE_URL=zoho_api_base_url
PORT=3000
SUPABASE_URL=supabase_url
SUPABASE_SERVICE_KEY=supabase_service_key
JWT_SECRET=jwt_secret_key
```

## Installation and Execution

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables in a `.env` file.

3. Run the server:
   ```
   npm start
   ```

## Frontend Integration

The frontend should communicate exclusively with the backend, sending commands to `/api/commands` and obtaining the user state through `/api/state/:email`. It should not have direct dependencies on external services like Zoho or Supabase.

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": {}
  }
}
```

## Functional Programming Patterns

The codebase follows strict functional programming principles:

### Immutability

- All data structures are immutable, enforced by `deepFreeze` utility
- No use of mutable variables (`let`, `var`) or mutable data structures
- No mutation of function parameters or global state

### Result Type Pattern

Instead of throwing exceptions, functions return a `Result` type that can be either:
- `Result.ok(value)`: Represents a successful operation with a value
- `Result.error(error)`: Represents a failed operation with an error

This allows for:
- Predictable error handling
- Function composition with error propagation
- No try/catch blocks in the core business logic

### Pure Functions

- Core business logic is implemented as pure functions
- No side effects (I/O, network, database) in the functional core
- Side effects are isolated to the shell layer
- Functions always return the same output for the same input

### Function Composition

- Complex operations are built by composing simple functions
- Utilities like `pipe` and `compose` facilitate function composition
- Curried functions for partial application

### Utility Functions

The `functional.js` module provides utilities for:
- Result type for functional error handling
- Deep freezing objects to enforce immutability
- Function composition with `pipe` and `compose`
- Currying with `curry`
- Safe property access with `safeGet` and `safeSet`
- Error handling with `tryCatch` and `tryCatchAsync`
- Immutable array and object operations