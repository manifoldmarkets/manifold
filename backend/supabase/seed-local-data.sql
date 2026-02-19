-- Seed data for LOCAL_ONLY development.
-- Run after load-local-schema.sh:
--   psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f seed-local-data.sql
--
-- Creates two test users, enables trading, and creates a sample market.

-- Test user (default for NEXT_PUBLIC_LOCAL_TEST_USER)
INSERT INTO users (id, name, username, balance, total_deposits, created_time, data)
VALUES (
  'test-user-1',
  'Test User',
  'testuser',
  5000,
  5000,
  now(),
  '{
    "id": "test-user-1",
    "name": "Test User",
    "username": "testuser",
    "avatarUrl": "",
    "balance": 5000,
    "totalDeposits": 5000,
    "createdTime": 1700000000000,
    "profitCached": {"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0},
    "creatorTraders": {"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0},
    "nextLoanCached": 0,
    "followerCountCached": 0,
    "isBannedFromPosting": false,
    "blockedUserIds": [],
    "blockedByUserIds": [],
    "blockedContractIds": [],
    "blockedGroupSlugs": []
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO private_users (id, data)
VALUES (
  'test-user-1',
  '{
    "id": "test-user-1",
    "email": "test@example.com",
    "notificationPreferences": {},
    "blockedUserIds": [],
    "blockedByUserIds": [],
    "blockedContractIds": [],
    "blockedGroupSlugs": []
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Admin user (uses Manifold DEV admin ID)
INSERT INTO users (id, name, username, balance, total_deposits, created_time, data)
VALUES (
  'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
  'Admin User',
  'adminuser',
  10000,
  10000,
  now(),
  '{
    "id": "IPTOzEqrpkWmEzh6hwvAyY9PqFb2",
    "name": "Admin User",
    "username": "adminuser",
    "avatarUrl": "",
    "balance": 10000,
    "totalDeposits": 10000,
    "isAdmin": true,
    "createdTime": 1700000000000,
    "profitCached": {"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0},
    "creatorTraders": {"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0},
    "nextLoanCached": 0,
    "followerCountCached": 0,
    "isBannedFromPosting": false,
    "blockedUserIds": [],
    "blockedByUserIds": [],
    "blockedContractIds": [],
    "blockedGroupSlugs": []
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO private_users (id, data)
VALUES (
  'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
  '{
    "id": "IPTOzEqrpkWmEzh6hwvAyY9PqFb2",
    "email": "admin@example.com",
    "notificationPreferences": {},
    "blockedUserIds": [],
    "blockedByUserIds": [],
    "blockedContractIds": [],
    "blockedGroupSlugs": []
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Enable trading
INSERT INTO system_trading_status (token, status)
VALUES ('MANA', true)
ON CONFLICT (token) DO UPDATE SET status = true;

-- Sample binary market
INSERT INTO contracts (
  id, slug, question, creator_id, mechanism, outcome_type,
  created_time, close_time, visibility, data
)
VALUES (
  'test-market-1',
  'will-this-test-pass',
  'Will this test pass?',
  'test-user-1',
  'cpmm-1',
  'BINARY',
  now(),
  now() + interval '30 days',
  'public',
  jsonb_build_object(
    'id', 'test-market-1',
    'slug', 'will-this-test-pass',
    'question', 'Will this test pass?',
    'creatorId', 'test-user-1',
    'creatorName', 'Test User',
    'creatorUsername', 'testuser',
    'mechanism', 'cpmm-1',
    'outcomeType', 'BINARY',
    'pool', '{"YES": 100, "NO": 100}'::jsonb,
    'p', 0.5,
    'totalLiquidity', 100,
    'subsidyPool', 0,
    'prob', 0.5,
    'probChanges', '{"day": 0, "week": 0, "month": 0}'::jsonb,
    'volume', 0,
    'volume24Hours', 0,
    'isResolved', false,
    'visibility', 'public',
    'elasticity', 0.5,
    'uniqueBettorCount', 0,
    'profitCached', '{"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0}'::jsonb,
    'creatorTraders', '{"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0}'::jsonb,
    'description', '{
      "type": "doc",
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A test market for local development."}]}]
    }'::jsonb,
    'createdTime', (extract(epoch from now()) * 1000)::bigint,
    'closeTime', (extract(epoch from (now() + interval '30 days')) * 1000)::bigint,
    'lastUpdatedTime', (extract(epoch from now()) * 1000)::bigint
  )
) ON CONFLICT (id) DO NOTHING;
