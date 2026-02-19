# Local Development Guide

Run Manifold locally without Firebase or GCP credentials using `LOCAL_ONLY` mode.

## Prerequisites

- Node.js 18+ and Yarn
- Docker (for Supabase)
- PostgreSQL client (`psql`) for schema loading

## Quick Start

### 1. Start Supabase

```bash
cd backend/supabase
npx supabase start        # First run pulls ~1-2GB of images
./load-local-schema.sh    # Load all table schemas
```

Note the output from `npx supabase start` — it shows the anon key, service_role key, and URLs. The default values in the template files should match.

### 2. Configure environment files

Copy the template files:

```bash
cp backend/api/.env.local.template backend/api/.env.local
cp backend/scheduler/.env.local.template backend/scheduler/.env.local
cp web/.env.local.template web/.env.local
```

### 3. Create test data

Connect to the local database and insert test users:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

```sql
-- Test user
INSERT INTO users (id, name, username, balance, data) VALUES
('test-user-1', 'Test User', 'testuser', 5000,
 '{"id":"test-user-1","name":"Test User","username":"testuser","avatarUrl":"","balance":5000,"totalDeposits":5000,"createdTime":1700000000000,"profitCached":{"allTime":0,"monthly":0,"weekly":0,"daily":0},"creatorTraders":{"allTime":0,"monthly":0,"weekly":0,"daily":0}}'::jsonb);

INSERT INTO private_users (id, data) VALUES
('test-user-1',
 '{"id":"test-user-1","notificationPreferences":{}}'::jsonb);

-- Enable trading
INSERT INTO system_trading_status (id, status) VALUES (1, 'active')
ON CONFLICT (id) DO UPDATE SET status = 'active';
```

### 4. Install dependencies

```bash
cd /path/to/manifold
yarn install
```

### 5. Start the API server

```bash
cd backend/api
set -a && source .env.local && set +a
yarn dev
```

The API server will start on port 8088.

### 6. Start the web frontend

In a separate terminal:

```bash
cd web
yarn dev:local
```

The web app will start on http://localhost:3000, configured to use the local API.

### 7. Verify

```bash
# User endpoint
curl http://localhost:8088/v0/user/testuser

# Authenticated request (using X-Local-User header)
curl -H "X-Local-User: test-user-1" http://localhost:8088/v0/me
```

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

**Frontend (Next.js web app):**
- `NEXT_PUBLIC_LOCAL_ONLY=true` enables local auth mode
- `NEXT_PUBLIC_LOCAL_TEST_USER=testuser` sets which user to auto-login as
- Fetches user from local API instead of using Firebase auth
- Sets `X-Local-User` header on all API calls
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_KEY` connect to local Supabase

## Switching Users

Change `NEXT_PUBLIC_LOCAL_TEST_USER` in `web/.env.local` and restart the web dev server.

## Stopping Services

```bash
# Stop Supabase (preserves data)
cd backend/supabase && npx supabase stop

# Stop Supabase and reset data
cd backend/supabase && npx supabase stop --no-backup
```

## Troubleshooting

**"Can't connect to Supabase"**: Make sure `npx supabase start` completed successfully and the ports match your .env.local files.

**Schema errors**: Some `ALTER TABLE ADD CONSTRAINT` warnings during schema loading are normal if constraints already exist.

**"Firebase JWT payload undefined"**: The frontend is trying to use Firebase auth. Make sure `NEXT_PUBLIC_LOCAL_ONLY=true` is set in `web/.env.local`.

## Credits

LOCAL_ONLY mode was originally developed by [@evand](https://github.com/evand) with fixes contributed by [@GabrielleVivissi](https://github.com/GabrielleVivissi) including Supabase client URL support, auth-context synchronous user ID, and metrics null checks.
