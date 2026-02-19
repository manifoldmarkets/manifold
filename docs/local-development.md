# Local Development Guide

Run Manifold locally without Firebase or GCP credentials using `LOCAL_ONLY` mode.

## Prerequisites

- Node.js 18+ and Yarn
- Docker (for Supabase local containers)
- PostgreSQL client (`psql`) for schema loading

## Quick Start

### 1. Install dependencies

```bash
cd /path/to/manifold
yarn install
```

### 2. Start Supabase

```bash
cd backend/supabase
npx supabase start        # First run pulls ~1-2GB of Docker images
./load-local-schema.sh    # Load all table schemas (3-pass function loading)
```

Note the output from `npx supabase start` — it shows the anon key, service_role key,
and URLs. The default values in the template files should match.

### 3. Configure environment files

```bash
cp backend/api/.env.local.template backend/api/.env.local
cp backend/scheduler/.env.local.template backend/scheduler/.env.local
cp web/.env.local.template web/.env.local
```

The templates have sensible defaults for local Supabase. No edits needed for basic usage.

### 4. Create test data

```bash
cd backend/supabase
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f seed-local-data.sql
```

This creates:
- **testuser** (ID: `test-user-1`) — regular user with M$5,000
- **adminuser** (ID: `IPTOzEqrpkWmEzh6hwvAyY9PqFb2`) — admin with M$10,000
- A sample binary market: "Will this test pass?"
- Trading enabled

### 5. Start the API server

```bash
cd backend/api
set -a && source .env.local && set +a
yarn dev
```

The API server starts on port 8088.

### 6. Start the web frontend

In a separate terminal:

```bash
cd web
yarn dev:local
```

The web app starts at http://localhost:3000, automatically logged in as **testuser**.

### 7. Verify

```bash
# Public endpoint
curl http://localhost:8088/v0/user/testuser

# Authenticated endpoint
curl -H "X-Local-User: test-user-1" http://localhost:8088/v0/me

# Market endpoint
curl http://localhost:8088/v0/slug/will-this-test-pass
```

Visit http://localhost:3000 — the homepage should load. Click on the test market or
visit http://localhost:3000/testuser to see the user profile.

## How LOCAL_ONLY Mode Works

Setting `LOCAL_ONLY=true` in the environment:

**Backend (API server, Scheduler):**
- Skips Firebase Admin SDK initialization
- Skips Google Cloud Secret Manager — reads secrets directly from env vars
- Skips GCP Monitoring metric writer
- Connects to local Supabase postgres via `SUPABASE_HOST`/`SUPABASE_PORT`

**Auth (API endpoints):**
- Accepts `X-Local-User` header with a user ID as trusted authentication
- No Firebase JWT verification needed
- Unauthenticated requests to auth-required endpoints return 401 (not a Firebase error)

**Frontend (Next.js web app):**
- `NEXT_PUBLIC_LOCAL_ONLY=true` enables local auth mode
- `NEXT_PUBLIC_LOCAL_TEST_USER=testuser` sets which username to auto-login as
- `NEXT_PUBLIC_LOCAL_TEST_USER_ID=test-user-1` sets the user ID for API auth headers
  (must match the database user ID — needed to avoid race conditions with async auth)
- Fetches user from local API instead of using Firebase auth
- Sets `X-Local-User` header on all API calls
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY` connect to local Supabase

## Switching Users

1. Change `NEXT_PUBLIC_LOCAL_TEST_USER` and `NEXT_PUBLIC_LOCAL_TEST_USER_ID` in `web/.env.local`
2. Restart the web dev server (`yarn dev:local`)

For example, to test as admin:
```
NEXT_PUBLIC_LOCAL_TEST_USER=adminuser
NEXT_PUBLIC_LOCAL_TEST_USER_ID=IPTOzEqrpkWmEzh6hwvAyY9PqFb2
```

## Resetting

```bash
# Reset database (clears all data, re-runs migrations + seed.sql)
cd backend/supabase
npx supabase db reset

# Then reload schema and test data
./load-local-schema.sh
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f seed-local-data.sql
```

## Stopping Services

```bash
# Stop Supabase (preserves data)
cd backend/supabase && npx supabase stop

# Stop Supabase and delete all data
cd backend/supabase && npx supabase stop --no-backup
```

## Troubleshooting

**"Missing X-Local-User header (LOCAL_ONLY mode)"**: The frontend is making API calls
before auth is set up. Make sure `NEXT_PUBLIC_LOCAL_TEST_USER_ID` is set in
`web/.env.local` and matches a user ID in the database.

**"Can't connect to Supabase"**: Make sure `npx supabase start` completed successfully
and the ports match your .env.local files.

**"relation X does not exist"**: Run `./load-local-schema.sh` to load all table schemas.
If you just ran `npx supabase db reset`, you need to re-run the schema loader.

**"Firebase JWT payload undefined"**: The frontend is trying to use Firebase auth.
Make sure `NEXT_PUBLIC_LOCAL_ONLY=true` is set in `web/.env.local`.

**Schema load shows "N skipped"**: The functions.sql loader runs 3 passes. The final
pass should show only 2 skipped (Manifold Love types not needed for local dev).
If more are skipped, check for missing extensions in seed.sql.

## Credits

LOCAL_ONLY mode was originally developed by [@evand](https://github.com/evand) with
fixes contributed by [@GabrielleVivissi](https://github.com/GabrielleVivissi) including
Supabase client URL support, auth-context synchronous user ID, and metrics null checks.
