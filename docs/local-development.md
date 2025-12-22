# Running Manifold Locally

A step-by-step guide to running Manifold Markets locally for development and testing. Written for first-time contributors who want to test changes before submitting PRs.

## What's Possible (Choose Your Path)

| Setup | Credentials Needed | What You Can Do |
|-------|-------------------|-----------------|
| **Web frontend only** | None | Browse real markets, view data, test UI changes |
| **Mock bet server** | None | Test bet calculations with real Manifold math |
| **Full local stack** | None (but complex setup) | Create markets, place bets, full testing |

**Choose based on your PR type:**
- UI changes, frontend fixes → Web frontend only
- Testing/debugging existing bet calculations → Mock bet server
- New AMM types, schema changes, numeric market rework → Full local stack

## Quick Win: Web Frontend (No Setup Required After Step 1)

After completing Step 1, you can immediately run:
```bash
cd web
yarn dev:prod
```

**Checkpoint**: Open http://localhost:3000 - you should see the Manifold homepage with real markets loading. You can browse, search, and view market details. (You can't place bets without logging in, but you can see everything.)

## Quick Win: Mock Bet Server (Test Calculations)

We have a mock server that uses Manifold's **real** calculation code:
```bash
cd backend/api
node mock-bet-server.js
```

**Checkpoint**: Test with curl:
```bash
curl -s http://localhost:8088/v0/slug/test | python3 -m json.tool | head -10
```
You should see JSON with market data. This runs on localhost:8088 and lets you test bet math without any database. See "Using the Mock Server" section below.

## Quick Start: Returning After Reboot

Already set up? Here's how to get running again:

```bash
# 1. Ensure Node 20 is active
source ~/.nvm/nvm.sh && nvm use 20

# 2. Start Supabase (if not running)
cd backend/supabase && npx supabase start
# Wait for "Started supabase local development setup"

# 3. Start API server (in one terminal)
cd backend/api
set -a && source .env.local && set +a
yarn dev

# 4. (Optional) Start frontend (in another terminal)
cd web
yarn dev:local
```

**Verify it's working:**
```bash
curl -s http://localhost:8088/v0/user/testuser | jq '.username'
# Should return: "testuser"
```

---

## Prerequisites

You'll need:
- **Node.js 20+** (we recommend using nvm to manage versions)
- **Yarn 1.x** (classic Yarn, not Yarn 2+)
- **Git** (to clone the repo)

For the **full local stack** (Steps 2+), you also need:
- **Docker** - Required for local Supabase. Install from https://docs.docker.com/engine/install/
  - On Ubuntu/Debian: `sudo apt-get install docker.io docker-compose`
  - Make sure Docker daemon is running: `sudo systemctl start docker`
  - Add yourself to docker group: `sudo usermod -aG docker $USER` (then log out/in)

## Step 1: Clone and Install Dependencies

### 1.1 Clone the Manifold repository

```bash
git clone https://github.com/manifoldmarkets/manifold.git
cd manifold
```

Or if you're working from a fork:
```bash
git clone https://github.com/YOUR_USERNAME/manifold.git
cd manifold
```

### 1.2 Install Node.js 20+

If you don't have Node 20+, install it via nvm:

```bash
# Install nvm if you don't have it (see https://github.com/nvm-sh/nvm)
# Then:
nvm install 20
nvm use 20
```

Verify:
```bash
node --version  # Should show v20.x.x
```

### 1.3 Install Yarn

```bash
npm install -g yarn
yarn --version  # Should show 1.22.x
```

### 1.4 Install project dependencies

From the manifold root directory:
```bash
yarn install
```

This takes about 60 seconds and will show some peer dependency warnings - that's normal.

### 1.5 Verify TypeScript compiles

```bash
cd backend/api
yarn compile
```

You should see no errors. This confirms your Node/Yarn/TypeScript toolchain is working.

**Checkpoint**: You should see "Found 0 errors" from TypeScript. At this point:
- The codebase *builds* ✓
- You can run the **web frontend** (`yarn dev:prod` in web/) ✓
- You can run the **mock bet server** (`node mock-bet-server.js` in backend/api/) ✓
- But `./dev.sh dev` will crash (needs credentials for full API server)

If you only need UI changes or bet calculation testing, you're done! Otherwise continue to Step 2 for the full local stack.

---

## Step 2: Set Up Local Supabase (PostgreSQL)

Manifold uses Supabase (PostgreSQL) for its database. For local development, we run Supabase locally via Docker.

**Prerequisite**: Docker must be installed and running. Verify with:
```bash
docker ps  # Should not error; may show empty list
```

### 2.1 Verify Supabase CLI works

The Supabase CLI is available via npx (no global install needed):
```bash
npx supabase --version
```

**Checkpoint**: Should show version (e.g., `1.190.0`). Ignore "new version available" warnings.

### 2.2 Start local Supabase

From the manifold root directory:
```bash
cd backend/supabase
npx supabase start
```

**First run**: This downloads Docker images (~1-2 GB) and takes several minutes. Be patient!

When it completes, you'll see output like:
```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
        anon key: eyJhbG...
service_role key: eyJhbG...
```

**Save these values!** You'll need them for configuration:
- `anon key` → `SUPABASE_KEY`
- `service_role key` → For admin operations
- Password is `postgres` by default

### 2.3 Verify Supabase is running

**Checkpoint**:
1. `docker ps` should show ~13 supabase containers running (all "healthy")
2. Open http://127.0.0.1:54323 in your browser - you should see Supabase Studio
3. The database has Manifold's base schema loaded (from seed.sql)

### 2.4 Important: Credentials to Save

The `supabase start` output shows credentials you'll need for later steps:
```
         API URL: http://127.0.0.1:54321
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
        anon key: eyJhbG... (long JWT)
service_role key: eyJhbG... (long JWT)
```

For our `.env.local` (Step 4):
- `SUPABASE_KEY` = the `anon key`
- `SUPABASE_PASSWORD` = `postgres` (from DB URL)
- `SUPABASE_INSTANCE_ID` = `127.0.0.1:54322`

---

## Step 3: Load the Database Schema

The Manifold schema consists of 100+ SQL files with complex dependencies. We've created a script to handle the load order automatically.

### 3.1 Run the schema loading script

From the `backend/supabase` directory:
```bash
./load-local-schema.sh
```

This script:
1. Loads extensions and text search configurations (seed.sql)
2. Creates helper functions (functions.sql)
3. Creates all tables in dependency order
4. Loads triggers, indexes, and policies
5. Creates views

**Expected output:**
```
[INFO] Loading Manifold schema into local Supabase...
[INFO] Phase 1: Loading extensions and text search configs...
[INFO] Phase 2: Loading helper functions (first pass)...
[INFO]   Created 21 functions (0 deferred - need tables first)
[INFO] Phase 3: Loading table definitions...
[INFO]   Created 99 tables (2 failed)
[INFO] Phase 4: Loading helper functions (second pass)...
[INFO]   Created/updated 50 functions
[INFO] Phase 5: Loading triggers, indexes, and policies...
[INFO] Phase 6: Loading views...
[INFO] Schema loading complete!

[INFO] Database summary:
  Tables: 104
  Functions: 298
```

**Note**: 2 tables (contract_boosts, mod_reports) may fail due to missing type definitions upstream. These are not essential for core betting functionality.

### 3.2 Verify the schema loaded

**Checkpoint**:
```bash
# Check key tables exist
docker exec supabase_db_firestore-replica psql -U postgres -d postgres -c \
  "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('users', 'contracts', 'contract_bets', 'answers')"
```

Expected: All 4 tables should be listed.

You can also explore the schema visually at http://127.0.0.1:54323 (Supabase Studio).

---

## Step 4: Configure the API Server for LOCAL_ONLY Mode

We've added a `LOCAL_ONLY` mode to the API server that bypasses Firebase/GCP entirely and uses local environment variables for configuration.

### 4.1 Create environment file

From the `backend/api` directory:
```bash
cp .env.local.template .env.local
```

The template contains the correct values for local Supabase. If you changed any Supabase settings, update accordingly:
```bash
# Required settings (already filled in template)
LOCAL_ONLY=true
SUPABASE_HOST=127.0.0.1
SUPABASE_PORT=54322
SUPABASE_PASSWORD=postgres
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # anon key from supabase start
API_SECRET=local-dev-secret
```

### 4.2 (Optional) Configure the Scheduler

If you want to run the scheduler as well:
```bash
cd backend/scheduler
cp .env.local.template .env.local
```

The scheduler uses port 8081 by default to avoid conflict with the API server on 8088.

---

## Step 5: Start the Development Server

### 5.1 Start the API server

From the `backend/api` directory:
```bash
# Source the environment file
set -a && source .env.local && set +a

# Start the server
yarn dev
```

**Expected output:**
```
Api server starting up...
Running in LOCAL_ONLY mode - skipping Firebase initialization
LOCAL_ONLY: Using secrets from environment variables
Secrets loaded.
Connecting to postgres at 127.0.0.1:54322
Connected to the db
Caches loaded.
Server started successfully
Serving API on port 8088.
```

**Checkpoint**: The API server should start without Firebase errors.

### 5.2 Verify the API is working

```bash
curl http://localhost:8088/v0/markets?limit=1
# Should return: [] (empty, since no markets exist yet)
```

### 5.3 (Optional) Start the Scheduler

In a separate terminal:
```bash
cd backend/scheduler
set -a && source .env.local && set +a
yarn dev
```

**Expected output:**
```
LOCAL_ONLY mode - skipping Firebase initialization
LOCAL_ONLY mode - using secrets from environment variables
Loaded 44 job(s).
Running in dev listening on port 8081.
```

---

## Step 6: Create Test Data and Verify End-to-End

Since we don't have Firebase auth, we'll insert test data directly into the database.

### 6.1 Insert a test user and market

```bash
docker exec -i supabase_db_firestore-replica psql -U postgres << 'EOF'
-- Insert test user (use manifold.markets/logo.png for avatar to avoid image domain errors)
INSERT INTO users (id, name, username, balance, data) VALUES
('test-user-1', 'Test User', 'testuser', 5000,
 '{"avatarUrl": "https://manifold.markets/logo.png", "creatorTraders": {}}')
ON CONFLICT (id) DO NOTHING;

-- Insert test market with visibility and score fields for homepage display
INSERT INTO contracts (id, creator_id, question, slug, mechanism, outcome_type, visibility, importance_score, popularity_score, daily_score, freshness_score, data, created_time) VALUES
('test-market-1', 'test-user-1', 'Will this test pass?', 'will-this-test-pass', 'cpmm-1', 'BINARY', 'public', 0.5, 10, 5, 200,
'{"question": "Will this test pass?", "outcomeType": "BINARY", "mechanism": "cpmm-1",
  "creatorId": "test-user-1", "creatorUsername": "testuser", "creatorName": "Test User",
  "creatorAvatarUrl": "https://manifold.markets/logo.png", "slug": "will-this-test-pass",
  "visibility": "public", "pool": {"YES": 100, "NO": 100}, "p": 0.5, "totalLiquidity": 100}',
NOW())
ON CONFLICT (id) DO NOTHING;
EOF
```

**Note**: The `visibility` and score columns are needed for markets to appear on the homepage. If markets don't show up, check these values.

### 6.2 Enable trading (required for betting!)

```bash
docker exec -i supabase_db_firestore-replica psql -U postgres << 'EOF'
CREATE TABLE IF NOT EXISTS system_trading_status (
  token TEXT PRIMARY KEY,
  status BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO system_trading_status (token, status) VALUES ('MANA', true), ('CASH', true)
ON CONFLICT DO NOTHING;
EOF
```

Without this table, betting will fail with "Trading is currently disabled."

### 6.3 Verify data via API

```bash
# Read user
curl -s http://localhost:8088/v0/user/testuser | jq '{username, balance}'

# Read market by slug
curl -s http://localhost:8088/v0/slug/will-this-test-pass | jq '{slug, probability}'
```

**Expected**: User with balance, market with 50% probability.

### 6.4 Place a test bet (the real acceptance test!)

```bash
curl -s -X POST http://localhost:8088/v0/bet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-user-1" \
  -H "X-Local-User: test-user-1" \
  -d '{
    "contractId": "test-market-1",
    "amount": 10,
    "outcome": "YES"
  }' | jq '{shares, probBefore, probAfter}'
```

**Expected output:**
```json
{
  "shares": 19.09,
  "probBefore": 0.5,
  "probAfter": 0.547
}
```

Verify the market updated:
```bash
curl -s http://localhost:8088/v0/slug/will-this-test-pass | jq '{probability, pool}'
# probability should now be ~0.547, not 0.5
```

### 6.5 Test dry-run forecasting

```bash
curl -s -X POST http://localhost:8088/v0/bet \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-user-1" \
  -H "X-Local-User: test-user-1" \
  -d '{
    "contractId": "test-market-1",
    "amount": 100,
    "outcome": "NO",
    "dryRun": true
  }' | jq '{shares, probBefore, probAfter}'
```

Dry-run returns what *would* happen without actually placing the bet.

### 6.6 Local email testing (Inbucket)

Inbucket captures emails at http://127.0.0.1:54324. Note: Manifold uses Mailgun in production, so their email code won't send to Inbucket without modification. But you can test the infrastructure:

```bash
# Send a test email via SMTP from within Docker network
docker run --rm --network supabase_network_firestore-replica python:3.11-slim python -c "
import smtplib
from email.mime.text import MIMEText

msg = MIMEText('Test email from local Manifold!')
msg['Subject'] = 'Local Manifold Test'
msg['From'] = 'test@manifold.local'
msg['To'] = 'testuser@manifold.local'

with smtplib.SMTP('supabase_inbucket_firestore-replica', 2500) as smtp:
    smtp.send_message(msg)
    print('Email sent!')
"

# Check it arrived
curl -s "http://localhost:54324/api/v1/mailbox/testuser" | jq '.[0].subject'
# Should return: "Local Manifold Test"
```

**Checkpoint**: If everything works, you now have:
- Local PostgreSQL (Supabase)
- API server connected to local DB
- Scheduler running (optional)
- Email capture (Inbucket)
- Can read/write data through the API

---

## Step 7: (Optional) Run the Web Frontend

The web frontend can also run against your local API.

### 7.1 Create environment file

```bash
cd web
cat > .env.local << 'EOF'
# Enable local-only mode (skip GCP credentials) - for server-side code
LOCAL_ONLY=true

# Enable local-only auth mode (uses test user from local API, skips Firebase)
NEXT_PUBLIC_LOCAL_ONLY=true
NEXT_PUBLIC_LOCAL_TEST_USER=testuser

# Local Supabase URL (REST API endpoint)
SUPABASE_URL=http://127.0.0.1:54321

# Supabase keys (from `npx supabase start` output)
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# service_role key - for admin SSR page rendering
DEV_ADMIN_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
EOF
```

### 7.2 Start the web server

```bash
yarn dev:local
```

This sets `NEXT_PUBLIC_API_URL=localhost:8088` and uses your `.env.local` for LOCAL_ONLY settings.

**Checkpoint**: Open http://localhost:3000 - you should see the Manifold homepage.

### 7.3 Known Issue: File Watcher Limit

On Linux, you may see errors like:
```
Error: ENOSPC: System limit for number of file watchers reached
```

Fix by increasing the limit:
```bash
sudo sysctl fs.inotify.max_user_watches=524288
```

To make permanent, add to `/etc/sysctl.conf`:
```
fs.inotify.max_user_watches=524288
```

---

## What's Working Now

**Authentication (LOCAL_ONLY mode)**: The web frontend can now auto-login as a test user:
- Set `NEXT_PUBLIC_LOCAL_ONLY=true` and `LOCAL_ONLY=true` in `web/.env.local`
- Set `NEXT_PUBLIC_LOCAL_TEST_USER=testuser` (or your test username)
- The frontend will automatically load the test user from the local API
- Bypasses Firebase entirely - no cloud auth needed
- Check browser console for "LOCAL_ONLY: User loaded successfully" message
- The frontend sends auth headers to the API automatically

**API with LOCAL_ONLY Auth**: The backend API accepts X-Local-User header:
- Authenticated endpoints work without Firebase JWTs
- The frontend automatically sends the user ID
- Market creation, betting, and other auth endpoints work

**Market Creation via API**: Markets can be created programmatically:
```bash
curl -X POST http://localhost:8088/v0/market \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-user-1" \
  -H "X-Local-User: test-user-1" \
  -d '{
    "question": "Test market via API",
    "outcomeType": "BINARY",
    "closeTime": 1767225600000,
    "liquidityTier": "M$100"
  }'
```

## Known Limitations

**Market Detail Page 404**: The market detail page (`/username/slug`) uses SSR with Supabase and may return 404 after environment changes. **Fix**: Restart the Next.js dev server to pick up new `.env.local` values.

**Email Notifications**: Manifold uses Mailgun for email, not local SMTP. See Step 6.6 for how to test email infrastructure directly.

**Database Triggers**: Some triggers may need to be created manually. If markets don't appear in search or are missing fields:
```sql
-- Create trigger to populate visibility/slug from JSONB data column
CREATE OR REPLACE FUNCTION contract_populate()
RETURNS TRIGGER AS $$
BEGIN
  NEW.slug := NEW.data->>'slug';
  NEW.visibility := COALESCE(NEW.data->>'visibility', 'public');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_populate
BEFORE INSERT OR UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION contract_populate();

-- For contract_liquidity table
CREATE OR REPLACE FUNCTION contract_liquidity_populate()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total := NEW.data->>'totalLiquidity';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contract_liquidity_populate
BEFORE INSERT OR UPDATE ON contract_liquidity
FOR EACH ROW EXECUTE FUNCTION contract_liquidity_populate();
```

**Metrics/Analytics**: Disabled in LOCAL_ONLY mode (no GCP connection)

---

## Troubleshooting

### "firebase: command not found"

The default `dev.sh` script tries to use Firebase CLI. For local-only development, we bypass this. See Step 4.

### "Please set the GOOGLE_APPLICATION_CREDENTIALS..." error

This means the API server is trying to use Firebase authentication. For local development, we configure it to skip this. See Step 4.

### Port 3000 already in use

Kill any existing Next.js processes:
```bash
pkill -f "next dev"
rm -f web/.next/dev/lock
```

### Supabase won't start

Make sure Docker is running:
```bash
docker ps  # Should show running containers, or at least not error
```

If Docker isn't running, start it first, then retry `supabase start`.

---

## Architecture Overview

For those who want to understand what they're setting up:

| Component | Production | Local |
|-----------|------------|-------|
| Frontend | Vercel (manifold.markets) | localhost:3000 |
| API Server | Google Cloud Run | localhost:8088 |
| Database | Supabase Cloud | Supabase Local (Docker) |
| Auth | Firebase | LOCAL_ONLY mode (mock) |

**Key directories:**
- `common/` - Shared code, including AMM math and bet calculations
- `web/` - Next.js frontend
- `backend/api/` - Express API server (where bet endpoints live)
- `backend/supabase/` - Database schema files

---

## Using the Mock Bet Server

The mock server (`backend/api/mock-bet-server.js`) is useful for testing bet calculations without a full stack.

### Start the server
```bash
cd backend/api
node mock-bet-server.js
# Runs on http://localhost:8088
```

### Test a bet calculation
```bash
curl -X POST http://localhost:8088/v0/bet \
  -H "Content-Type: application/json" \
  -d '{
    "contractId": "mock-market-id",
    "amount": 10,
    "outcome": "YES",
    "answerId": "8235ec266b3a",
    "dryRun": true
  }'
```

### Load real market data
You can inject real market data for testing:
```bash
curl -X POST http://localhost:8088/update-market-data \
  -H "Content-Type: application/json" \
  -d '{
    "marketId": "your-market-id",
    "marketData": {
      "mechanism": "cpmm-multi-1",
      "shouldAnswersSumToOne": true,
      "answers": [...]
    }
  }'
```

The mock server uses the same calculation code as production (`common/lib/new-bet.js`), so results should match exactly.

---

## Getting Help

- **Manifold Discord**: https://discord.gg/3Zuth9792G
- **GitHub Issues**: https://github.com/manifoldmarkets/manifold/issues
- **This guide**: Contributions welcome! If you find errors or have improvements, please submit a PR.
