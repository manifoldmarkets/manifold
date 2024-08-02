
# API Endpoints

This directory contains the implementation of various API endpoints for the Manifold platform.

## Key Concepts

- Each endpoint is typically implemented in its own file.
- The `app.ts` file serves as the main router, connecting endpoint handlers to their respective routes.
- We use Supabase for database operations.
- Authentication is handled using the `APIHandler` type, which automatically manages user authentication based on the schema definition.

## Adding a New API Endpoint

To add a new API endpoint, follow these steps:

1. Create a new file for the endpoint in the `backend/api/src` directory.
2. Implement the endpoint logic in the new file.
3. Add the endpoint schema to `common/src/api/schema.ts`, including props, return type, and other information.
4. Update `backend/api/src/app.ts`:
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

// 3. Update backend/api/src/app.ts
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
export const myAuthenticatedEndpoint: APIHandler<'my-authenticated-endpoint'> = async (props, auth, req) => {
  const { uid } = auth // auth object is automatically provided for authenticated endpoints
  // Implement endpoint logic here
}
```

## Best Practices

- Use the `createSupabaseDirectClient` function from `shared/supabase/init` for database operations.
- Keep endpoint logic modular and reusable when possible.
- Use TypeScript types consistently to ensure type safety across the API.
- Use Zod schemas in `common/src/api/schema.ts` to define prop and return types for strong type checking.
- Use the `APIError` class from `api/helpers/endpoint` to throw standardized API errors.
