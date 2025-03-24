# Helpdesk POC - FCIS Architecture with Event Sourcing

This project implements a helpdesk API following Functional Core, Imperative Shell (FCIS) principles and Event Sourcing. The architecture maintains a clear separation between pure business logic (without side effects) and operations with side effects.

## Design Principles

- **Functional Core**: All business logic is implemented in pure functions without side effects.
- **Imperative Shell**: Interactions with external services (Zoho, Supabase) are isolated in the shell layer.
- **Event Sourcing**: The system state is reconstructed from a sequence of stored events.
- **Immutability**: No mutable data structures or mutable control flows are used.

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
│    └── index.js                  # Define /api/commands and /api/state/:userId
└── index.js                       # Glue file (wires together server & shell)
```

## Endpoints

### FCIS Endpoints

- **POST /api/commands**: Centralized endpoint to receive commands from the frontend.
- **GET /api/state/:userId**: Endpoint to reconstruct user state from events.

## Data Flow

1. The frontend sends commands to the `/api/commands` endpoint.
2. The backend validates the command using pure functions.
3. If the command is valid, an event is generated using the pure transition function.
4. The event is stored in Supabase (side effect).
5. External services like Zoho are notified (side effect).
6. The frontend can reconstruct the user's state by querying `/api/state/:userId`.

## Command Types

- `LOGIN_ATTEMPT`: User login
- `CREATE_TICKET`: Create a new ticket
- `UPDATE_TICKET`: Update an existing ticket
- `ADD_COMMENT`: Add a comment to a ticket
- `ESCALATE_TICKET`: Escalate ticket priority
- `FETCH_DASHBOARD`: Request dashboard data

## Environment Variables

```
ZOHO_AUTH_TOKEN=zoho_authentication_token
ZOHO_BASE_URL=zoho_api_base_url
PORT=3000
SUPABASE_URL=supabase_url
SUPABASE_SERVICE_KEY=supabase_service_key
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

The frontend should communicate exclusively with the backend, sending commands to `/api/commands` and obtaining the user state through `/api/state/:userId`. It should not have direct dependencies on external services like Zoho or Supabase.

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
