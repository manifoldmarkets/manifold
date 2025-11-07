-- Manifold Backend Simplified - Database Schema
-- 8 Essential Tables for MVP

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ============================================================================
-- 1. USERS - User accounts and balances
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Identity
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,

  -- Finances
  balance NUMERIC DEFAULT 1000 NOT NULL,
  total_deposits NUMERIC DEFAULT 0 NOT NULL,

  -- Full data (JSONB for flexibility)
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_created_time_idx ON users(created_time DESC);
CREATE INDEX IF NOT EXISTS users_balance_idx ON users(balance DESC);
CREATE INDEX IF NOT EXISTS users_data_gin_idx ON users USING GIN(data);

-- Full text search on name and username
CREATE INDEX IF NOT EXISTS users_name_username_search_idx
  ON users USING GIN(to_tsvector('english', name || ' ' || username));

-- ============================================================================
-- 2. CONTRACTS - Prediction markets
-- ============================================================================
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  creator_id TEXT NOT NULL REFERENCES users(id),

  question TEXT NOT NULL,
  description TEXT DEFAULT '',

  -- Market mechanics
  mechanism TEXT DEFAULT 'cpmm-1' NOT NULL,
  outcome_type TEXT NOT NULL CHECK (outcome_type IN ('BINARY', 'MULTIPLE_CHOICE')),

  -- State
  created_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  close_time TIMESTAMP WITH TIME ZONE,
  resolution TEXT CHECK (resolution IN ('YES', 'NO', 'MKT', 'CANCEL')),
  resolution_time TIMESTAMP WITH TIME ZONE,
  resolution_probability NUMERIC,

  -- Tracking
  last_bet_time TIMESTAMP WITH TIME ZONE,
  last_comment_time TIMESTAMP WITH TIME ZONE,

  -- Stats
  volume NUMERIC DEFAULT 0,
  unique_bettor_count INTEGER DEFAULT 0 NOT NULL,

  -- Flags
  deleted BOOLEAN DEFAULT FALSE NOT NULL,
  visibility TEXT DEFAULT 'public',

  -- Full data (JSONB)
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS contracts_creator_id_idx ON contracts(creator_id);
CREATE INDEX IF NOT EXISTS contracts_created_time_idx ON contracts(created_time DESC);
CREATE INDEX IF NOT EXISTS contracts_close_time_idx ON contracts(close_time) WHERE close_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS contracts_resolution_idx ON contracts(resolution) WHERE resolution IS NOT NULL;
CREATE INDEX IF NOT EXISTS contracts_unique_bettor_count_idx ON contracts(unique_bettor_count DESC);
CREATE INDEX IF NOT EXISTS contracts_volume_idx ON contracts(volume DESC);
CREATE INDEX IF NOT EXISTS contracts_data_gin_idx ON contracts USING GIN(data);

-- Full text search on question and description
CREATE INDEX IF NOT EXISTS contracts_question_search_idx
  ON contracts USING GIN(to_tsvector('english', question || ' ' || COALESCE(description, '')));

-- ============================================================================
-- 3. CONTRACT_BETS - Trades/bets on markets
-- ============================================================================
CREATE TABLE IF NOT EXISTS contract_bets (
  bet_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  contract_id TEXT NOT NULL REFERENCES contracts(id),

  created_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Bet details
  amount NUMERIC NOT NULL,
  outcome TEXT NOT NULL,
  shares NUMERIC NOT NULL,

  prob_before NUMERIC,
  prob_after NUMERIC,

  -- Optional
  answer_id TEXT, -- For MULTIPLE_CHOICE markets
  is_redemption BOOLEAN DEFAULT FALSE NOT NULL,

  -- Full data (JSONB)
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS contract_bets_user_id_idx ON contract_bets(user_id);
CREATE INDEX IF NOT EXISTS contract_bets_contract_id_idx ON contract_bets(contract_id);
CREATE INDEX IF NOT EXISTS contract_bets_created_time_idx ON contract_bets(created_time DESC);
CREATE INDEX IF NOT EXISTS contract_bets_answer_id_idx ON contract_bets(answer_id) WHERE answer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contract_bets_contract_user_idx ON contract_bets(contract_id, user_id);

-- ============================================================================
-- 4. TXNS - Financial transactions
-- ============================================================================
CREATE TABLE IF NOT EXISTS txns (
  id TEXT PRIMARY KEY,
  created_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  -- Parties
  from_type TEXT NOT NULL CHECK (from_type IN ('USER', 'BANK', 'CONTRACT')),
  from_id TEXT NOT NULL,
  to_type TEXT NOT NULL CHECK (to_type IN ('USER', 'BANK', 'CONTRACT')),
  to_id TEXT NOT NULL,

  -- Transaction
  amount NUMERIC NOT NULL CHECK (amount > 0),
  token TEXT DEFAULT 'MANA' NOT NULL,
  category TEXT NOT NULL,

  -- Full data (JSONB)
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS txns_from_id_idx ON txns(from_id);
CREATE INDEX IF NOT EXISTS txns_to_id_idx ON txns(to_id);
CREATE INDEX IF NOT EXISTS txns_created_time_idx ON txns(created_time DESC);
CREATE INDEX IF NOT EXISTS txns_category_idx ON txns(category);
CREATE INDEX IF NOT EXISTS txns_user_activity_idx ON txns(created_time DESC)
  WHERE from_type = 'USER' OR to_type = 'USER';

-- ============================================================================
-- 5. ANSWERS - For MULTIPLE_CHOICE markets
-- ============================================================================
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,

  text TEXT NOT NULL,

  -- CPMM pools
  pool_yes NUMERIC DEFAULT 0 NOT NULL,
  pool_no NUMERIC DEFAULT 0 NOT NULL,
  prob NUMERIC,

  -- Resolution
  resolution TEXT CHECK (resolution IN ('YES', 'NO')),
  resolution_time TIMESTAMP WITH TIME ZONE,

  -- Full data (JSONB)
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS answers_contract_id_idx ON answers(contract_id);

-- ============================================================================
-- 6. CONTRACT_COMMENTS - Comments on markets
-- ============================================================================
CREATE TABLE IF NOT EXISTS contract_comments (
  comment_id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),

  created_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  content TEXT NOT NULL,

  -- Full data (JSONB)
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS contract_comments_contract_id_idx ON contract_comments(contract_id);
CREATE INDEX IF NOT EXISTS contract_comments_user_id_idx ON contract_comments(user_id);
CREATE INDEX IF NOT EXISTS contract_comments_created_time_idx ON contract_comments(created_time DESC);

-- ============================================================================
-- 7. PRIVATE_USERS - Private user data
-- ============================================================================
CREATE TABLE IF NOT EXISTS private_users (
  id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  email TEXT,
  api_secret TEXT UNIQUE,

  -- Notification tokens
  notification_preferences JSONB DEFAULT '{}'::jsonb,

  -- Full private data (JSONB)
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX IF NOT EXISTS private_users_api_secret_idx ON private_users(api_secret)
  WHERE api_secret IS NOT NULL;

-- ============================================================================
-- 8. USER_REACTIONS - Likes/reactions (optional but useful)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_reactions (
  user_id TEXT NOT NULL REFERENCES users(id),
  content_id TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'contract', 'comment', etc.
  created_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

  PRIMARY KEY (user_id, content_id, content_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS user_reactions_content_idx ON user_reactions(content_id, content_type);
CREATE INDEX IF NOT EXISTS user_reactions_created_time_idx ON user_reactions(created_time DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (Optional for MVP, but good practice)
-- ============================================================================

-- Public read for users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_public_read ON users FOR SELECT USING (true);

-- Public read for contracts table
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contracts_public_read ON contracts FOR SELECT USING (NOT deleted);

-- Public read for bets table
ALTER TABLE contract_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_bets_public_read ON contract_bets FOR SELECT USING (true);

-- Private users only accessible by owner (implement in application layer for MVP)
ALTER TABLE private_users ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPFUL FUNCTIONS
-- ============================================================================

-- Function to update user balance
CREATE OR REPLACE FUNCTION update_user_balance(
  p_user_id TEXT,
  p_amount NUMERIC
) RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET balance = balance + p_amount
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment unique bettor count
CREATE OR REPLACE FUNCTION increment_unique_bettors(
  p_contract_id TEXT,
  p_user_id TEXT
) RETURNS VOID AS $$
DECLARE
  v_has_bet BOOLEAN;
BEGIN
  -- Check if user has already bet
  SELECT EXISTS(
    SELECT 1
    FROM contract_bets
    WHERE contract_id = p_contract_id
      AND user_id = p_user_id
  ) INTO v_has_bet;

  -- Increment if first bet
  IF NOT v_has_bet THEN
    UPDATE contracts
    SET unique_bettor_count = unique_bettor_count + 1
    WHERE id = p_contract_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (Optional - for testing)
-- ============================================================================

-- Insert a test user (only if not exists)
INSERT INTO users (id, name, username, avatar_url, balance, data)
VALUES (
  'test-user-1',
  'Test User',
  'testuser',
  'https://api.dicebear.com/7.x/avataaars/svg?seed=test-user-1',
  10000,
  '{"creatorTraders": {"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0}}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- DONE!
-- ============================================================================

-- Summary:
-- ✅ 8 core tables (users, contracts, bets, txns, answers, comments, private_users, reactions)
-- ✅ Essential indexes for performance
-- ✅ Full text search capabilities
-- ✅ Row level security policies
-- ✅ Helper functions
-- ✅ Flexible JSONB columns for future extension

-- To run this schema:
-- psql -h your-host -U your-user -d your-database -f schema.sql
