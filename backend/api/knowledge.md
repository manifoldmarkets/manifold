# API Endpoints

This directory contains the implementation of various API endpoints for the Manifold platform.

## Key Concepts

- Each endpoint is typically implemented in its own file.
- The `routes.ts` file serves as the main router, connecting endpoint handlers to their respective routes.
- We use Supabase for database operations.
- Authentication is handled using the `APIHandler` type, which automatically manages user authentication based on the schema definition.
- The API VM is run on GCP as a single instance with 4 cores. One core is a write instance that handles all routes that write to the DB. The other cores are read-only instances and handle routes specified in `backend/api/url-map-config.yaml`.

## Mana/Sweepstakes Market Relationships

- Mana markets can have sweepstakes counterpart markets (siblingContractId)
- The mana market is the source of truth - changes to mana markets should propagate to their sweepstakes counterparts
- Changes that need to propagate include:
  - Adding new answers to multiple choice markets
  - Market metadata updates
  - Market resolution

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
- For environment-specific IDs and constants, check common/antes.ts first as it contains important platform-wide constants like HOUSE_LIQUIDITY_PROVIDER_ID.

## Sports Markets

- Each sports event can have at most one MANA market and one CASH market
- If creation of the MANA market fails (e.g., due to duplicate sportsEventId), do not attempt to create the CASH market
- The MANA market is considered the "source of truth" - the CASH market should only exist if there is a corresponding MANA market
- Prefer lightweight check endpoints over complex validation in create/update endpoints when the check might be useful in other contexts

## Boosts

- The `contract_boosts` table supports boosting both contracts and posts
- Either `contract_id` or `post_id` must be specified, but not both
- The `purchase-boost` endpoint accepts either `contractId` or `postId` parameter
- Boosted content gets higher importance scores and appears more prominently on the homepage
- Boosts last for 24 hours and can be paid for with mana or cash

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

## User Bans and Moderation

The ban system controls what actions users can perform. Bans and mod alerts are stored in the `user_bans` database table and checked server-side before allowing user actions.

### Ban Types

There are four ban types defined in `common/src/user.ts`:

| Ban Type | What It Blocks |
|----------|---------------|
| `posting` | Commenting, messaging, creating posts, adding answers, poll voting, sending managrams |
| `marketControl` | Creating/editing/resolving markets, hiding comments, adding/editing answers, poll voting, adding topics |
| `trading` | Betting, managrams, liquidity changes, adding answers, poll voting |
| `modAlert` | **Does NOT block any actions** - used for warning messages to users with full audit history |

Some actions are blocked by multiple ban types (e.g., `pollVote` is blocked by all three blocking types).

### How to Add Ban Checks to an Endpoint

For new endpoints that perform user actions, use the `onlyUsersWhoCanPerformAction` wrapper from `helpers/rate-limit.ts`:

```typescript
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const myEndpoint: APIHandler<'my-endpoint'> = onlyUsersWhoCanPerformAction(
  'actionName',  // Must be a key in getBanTypesForAction()
  async (props, auth, req) => {
    // Your endpoint logic here
  }
)
```

The action name must be registered in `getBanTypesForAction()` in `common/src/ban-utils.ts`:

```typescript
export function getBanTypesForAction(action: string): BanType[] {
  const actionMap: Record<string, BanType[]> = {
    'comment': ['posting'],
    'createMarket': ['marketControl'],
    'trade': ['trading'],
    'myNewAction': ['posting'],  // Add your action here
    // ...
  }
  return actionMap[action] || []
}
```

### Manual Ban Checks

For more complex scenarios (e.g., checking bans inside a transaction), use manual checks:

```typescript
import { getActiveUserBans } from './helpers/rate-limit'
import { isUserBanned } from 'common/ban-utils'

const userBans = await getActiveUserBans(auth.uid)
if (isUserBanned(userBans, 'trading')) {
  throw new APIError(403, 'You are banned from trading')
}
```

### Endpoints Currently Using Ban Checks

**Using `onlyUsersWhoCanPerformAction` wrapper:**
- `create-market.ts` → `'createMarket'`
- `create-comment.ts` → `'comment'`
- `create-post.ts` → `'post'`
- `update-post.ts` → `'post'`
- `update-market.ts` → `'updateMarket'`
- `create-answer-cpmm.ts` → `'createAnswer'`
- `purchase-boost.ts` → `'boost'`
- `add-topic-to-market.ts` → `'addTopic'`
- `post.ts` (comments) → `'comment'`

**Using manual ban checks:**
- `resolve-market.ts` → checks `marketControl`
- `unresolve.ts` → checks `marketControl`
- `hide-comment.ts` → checks `marketControl`
- `edit-answer.ts` → checks `marketControl`
- `add-liquidity.ts` → checks `trading`
- `remove-liquidity.ts` → checks `trading`
- `cast-poll-vote.ts` → checks all ban types via `getBanTypesForAction('pollVote')`
- `managram.ts` → checks via `canSendMana()` (posting + trading)
- `create-private-user-message.ts` → checks `posting`
- `create-private-user-message-channel.ts` → checks `posting`
- `create-public-chat-message.ts` → checks `posting`
- `create-post-comment.ts` → checks `posting`

### Endpoints That Intentionally Skip Ban Checks

Some endpoints don't require ban checks because they don't represent user "actions" that could be abused:

- **`reaction.ts`** - Likes/dislikes are low-impact and can be removed; abuse is handled via other means
- **Read-only endpoints** (get-*, search-*, etc.) - No state changes

### Endpoints with Hidden Ban Checks (Deprecated Features)

These endpoints have ban checks but the restrictions are not shown in the UI ban descriptions (because the features are deprecated):

- **`add-bounty.ts`** - Checks `trading` ban (bounties are deprecated)
- **`donate.ts`** - Checks `trading` ban (old charity donation system deprecated; new lottery system handles this separately)

### Legacy Ban System

There is a legacy ban field `isBannedFromPosting` on the User object. During the migration period:
- Server-side checks use BOTH the new `user_bans` table AND the legacy field
- Example: `isUserBanned(userBans, 'posting') || user.isBannedFromPosting`

### Database Schema

Bans are stored in the `user_bans` table:

```sql
create table user_bans (
  id serial primary key,
  user_id text not null references users(id),
  ban_type text not null,  -- 'posting', 'marketControl', or 'trading'
  reason text,
  created_at timestamptz not null default now(),
  created_by text references users(id),
  end_time timestamptz,     -- null = permanent ban
  ended_by text references users(id),
  ended_at timestamptz      -- set when ban is manually lifted
);
```

Active bans are those where `ended_at IS NULL AND (end_time IS NULL OR end_time > now())`.

### Mod Alerts

Mod alerts are stored in the `user_bans` table with `ban_type = 'modAlert'`. This provides:
- Full audit history (who sent which alerts, when they were dismissed, by whom)
- Consistent querying with other bans
- Multiple historical alerts can be tracked

When a user dismisses their mod alert, it sets `ended_by = user_id` and `ended_at = now()`.
When a mod clears a user's alert, it goes through the ban-user endpoint with `bans: { modAlert: false }`.

### Related Files

- `common/src/ban-utils.ts` - Ban checking utilities and action→ban type mapping
- `common/src/user.ts` - `BanType` and `UserBan` type definitions
- `backend/api/src/helpers/rate-limit.ts` - `getActiveUserBans()`, `onlyUsersWhoCanPerformAction()`
- `backend/api/src/ban-user.ts` - Admin endpoint to ban/unban users and send mod alerts
- `backend/api/src/get-user-bans.ts` - Endpoint to fetch user bans (users can fetch their own, mods can fetch anyone's)
- `backend/api/src/dismiss-mod-alert.ts` - User endpoint to dismiss their own mod alert
- `backend/scheduler/src/jobs/unban-users.ts` - Scheduled job to expire temporary bans
- `web/components/moderation/ban-banner.tsx` - User-facing banner showing bans and mod alerts
- `web/components/moderation/ban-modal.tsx` - Mod interface for managing bans and alerts
