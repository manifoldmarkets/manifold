# API Endpoints

This directory contains the implementation of various API endpoints for the Manifold platform.

## Key Concepts

- Each endpoint is typically implemented in its own file.
- The `routes.ts` file serves as the main router, connecting endpoint handlers to their respective routes.
- We use Supabase for database operations.
- Authentication is handled using the `APIHandler` type, which automatically manages user authentication based on the schema definition.

## Architecture

- The API runs in Docker containers on Google Cloud Platform (GCP)
- A GCP load balancer sits in front of the API containers
- The API is split into two Express instances:
  - Main API (port 8088): Handles all POST endpoints and stateful operations
  - Read-only API (port 8090, 8091, 8092): Handles GET endpoints for better scalability
- Load balancer configuration is managed through GCP console, not in codebase
- Scaling strategy:
  - Use PM2 cluster mode to run multiple instances on different cores of same machine
  - Each instance runs on different ports
  - Load balancer distributes traffic between ports
  - Prefer this over deploying separate instance groups for simpler operations

## Adding a New API Endpoint

To add a new API endpoint, follow these steps:

1. Create a new file for the endpoint in the `backend/api/src` directory. Each endpoint should be in a new file.
2. Implement the endpoint logic in the new file.
3. Add the endpoint schema to `common/src/api/schema.ts`, including props, return type, and other information. Note that we only use POST and GET methods.
4. Update `backend/api/src/routes.ts`:
   - Import the handler function from the new file.
   - Add the handler to the `handlers` object.

Example:

```typescript
// 1. Create a new file: backend/api/src/my-new-endpoint.ts
import { APIHandler } from 'api/helpers/endpoint'

export const myNewEndpoint: APIHandler<'my-new-endpoint'> = async (props, auth, req) => {
  // Implement endpoint logic here
}

// 2. Add to common/src/api/schema.ts
'my-new-endpoint': {
  method: 'POST',
  visibility: 'public',
  authed: true,
  props: z.object({
    // Define props here using Zod schema
  }),
  returns: z.object({
    // Define return type here using Zod schema
  }),
},

// 3. Update backend/api/src/routes.ts
import { myNewEndpoint } from './my-new-endpoint'

const handlers: { [k in APIPath]: APIHandler<k> } = {
  // ... existing handlers
  'my-new-endpoint': myNewEndpoint,
}
```

## Authentication

Authentication is managed automatically by the `APIHandler` type. The `authed` property in the schema determines the authentication behavior:

- `false`: The endpoint can be called without authentication.
- `true`: The endpoint requires authentication. The `auth` object will be provided to the handler function.

Example of an authenticated endpoint:

```typescript
export const myAuthenticatedEndpoint: APIHandler<
  'my-authenticated-endpoint'
> = async (props, auth, req) => {
  const { uid } = auth // auth object is automatically provided for authenticated endpoints
  // Implement endpoint logic here
}
```

## Best Practices

- Use the `createSupabaseDirectClient` function from `shared/supabase/init` for database operations.
  This uses the pg promise library, where you pass raw sql strings like so:

```ts
import { createSupabaseClient } from 'shared/supabase/init'

const pg = createSupabaseDirectConnection()
const contractIds = await pg.manyOrNone(
  `select id from contracts`,
  [],
  (r) => r.id as string
)
```

- Keep endpoint logic modular and reusable when possible.
- Use TypeScript types consistently to ensure type safety across the API.
- Use Zod schemas in `common/src/api/schema.ts` to define prop and return types for strong type checking.
- Use the `APIError` class from `api/helpers/endpoint` to throw standardized API errors.
- Use lowercase SQL keywords in queries. Don't capitalize SQL keywords.
- Avoid editing the SQL via `${}`, and instead when using pgpromise, use the argument following the query to pass parameters to the query.

### Schema Definition

We use Zod for defining our API schemas. This provides runtime type checking and automatic documentation generation.

#### Setting Defaults

When defining schemas, prefer setting defaults in the Zod schema rather than in the handler function. This ensures that the default values are documented and type-checked.

Example:

```typescript
props: z.object({
  limit: z.number().default(50),
  offset: z.number().default(0),
  // other properties...
}).strict(),
```

### Data schema

Tables like contract_comments, contract_bets, contract_follows, etc, use two primary ids: contract_id, and an id specific to the table: comment_id, bet_id, or follow_id. Thus they have no primary 'id' column.

Thus to get a comment you would do:

```sql
select * from contract_comments where comment_id = $1
```

### Query Construction

For constructing SQL queries, we use custom SQL builder helper functions. These functions provide a more type-safe and maintainable way to build complex queries.

#### SQL Builder Functions

Use the sqlBuilder from `shared/supabase/sql-builder.ts` for constructing SQL queries with re-useable components. It has several helper functions for building SQL queries, including:

- `select`: Specifies the columns to select
- `from`: Specifies the table to query
- `where`: Adds WHERE clauses
- `orderBy`: Specifies the order of results
- `limit`: Limits the number of results
- `renderSql`: Combines all parts into a final SQL string

Example usage:

```typescript
const query = renderSql(
  select('*'),
  from('txns'),
  where('token = ${token}', { token }),
  orderBy('created_time desc'),
  limit(limitValue)
)
```

Using these functions instead of string concatenation helps prevent SQL injection and makes queries easier to read and maintain.
