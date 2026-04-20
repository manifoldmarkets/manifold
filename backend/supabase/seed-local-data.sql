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
    "blockedGroupSlugs": [],
    "isAdvancedTrader": true
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

-- Enable trading (both MANA and CASH tokens)
INSERT INTO system_trading_status (token, status)
VALUES ('MANA', true), ('CASH', true)
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
    'collectedFees', '{"creatorFee": 0, "platformFee": 0, "liquidityFee": 0}'::jsonb,
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

-- Sample sum-to-one multi-choice market for rebalance endpoint testing.
-- 3 answers (red/green/blue) with probs 0.3/0.3/0.4 summing to 1.
INSERT INTO contracts (
  id, slug, question, creator_id, mechanism, outcome_type,
  created_time, close_time, visibility, data
)
VALUES (
  'test-multi-1',
  'which-color-wins',
  'Which color will win?',
  'test-user-1',
  'cpmm-multi-1',
  'MULTIPLE_CHOICE',
  now(),
  now() + interval '30 days',
  'public',
  jsonb_build_object(
    'id', 'test-multi-1',
    'slug', 'which-color-wins',
    'question', 'Which color will win?',
    'creatorId', 'test-user-1',
    'creatorName', 'Test User',
    'creatorUsername', 'testuser',
    'mechanism', 'cpmm-multi-1',
    'outcomeType', 'MULTIPLE_CHOICE',
    'shouldAnswersSumToOne', true,
    'addAnswersMode', 'DISABLED',
    'totalLiquidity', 300,
    'subsidyPool', 0,
    'volume', 0,
    'volume24Hours', 0,
    'isResolved', false,
    'visibility', 'public',
    'elasticity', 0.5,
    'collectedFees', '{"creatorFee": 0, "platformFee": 0, "liquidityFee": 0}'::jsonb,
    'uniqueBettorCount', 1,
    'profitCached', '{"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0}'::jsonb,
    'creatorTraders', '{"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0}'::jsonb,
    'description', '{
      "type": "doc",
      "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Test multi-choice market with pre-seeded NO-in-multiple position for rebalance testing."}]}]
    }'::jsonb,
    'createdTime', (extract(epoch from now()) * 1000)::bigint,
    'closeTime', (extract(epoch from (now() + interval '30 days')) * 1000)::bigint,
    'lastUpdatedTime', (extract(epoch from now()) * 1000)::bigint,
    'token', 'MANA'
  )
) ON CONFLICT (id) DO NOTHING;

-- Three answers with probs 0.3, 0.3, 0.4 (sum to 1).
-- Pool sized to give correct prob under p=0.5 CPMM: prob = poolNo / (poolYes + poolNo).
-- Red/Green prob 0.3 → poolNo=30, poolYes=70. Blue prob 0.4 → poolNo=40, poolYes=60.
INSERT INTO answers (
  id, contract_id, index, text, user_id, created_time,
  pool_yes, pool_no, prob, total_liquidity, subsidy_pool, volume
) VALUES
  ('answer-red', 'test-multi-1', 0, 'Red', 'test-user-1', now(), 70, 30, 0.3, 100, 0, 0),
  ('answer-green', 'test-multi-1', 1, 'Green', 'test-user-1', now(), 70, 30, 0.3, 100, 0, 0),
  ('answer-blue', 'test-multi-1', 2, 'Blue', 'test-user-1', now(), 60, 40, 0.4, 100, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- test-user-1 pre-seeded position: NO in red (2 shares), NO in green (1 share).
-- Expected rebalance: totalNo=3, effectiveYes red=1/green=2/blue=3, minShares=1,
-- cash $1, finalYes red=0/green=1/blue=2.
INSERT INTO user_contract_metrics (
  user_id, contract_id, answer_id, data,
  has_shares, has_no_shares, has_yes_shares,
  total_shares_no, total_shares_yes, profit, loan, margin_loan
) VALUES
  ('test-user-1', 'test-multi-1', 'answer-red',
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-1', 'answerId', 'answer-red',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.3, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 1.4, 'loan', 0, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 2}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 1.4}'::jsonb,
     'payout', 1.4, 'totalAmountSold', 0, 'totalAmountInvested', 1.4,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 2, 0, 0, 0, 0),
  ('test-user-1', 'test-multi-1', 'answer-green',
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-1', 'answerId', 'answer-green',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.3, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 0.7, 'loan', 0, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 1}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 0.7}'::jsonb,
     'payout', 0.7, 'totalAmountSold', 0, 'totalAmountInvested', 0.7,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 1, 0, 0, 0, 0),
  ('test-user-1', 'test-multi-1', 'answer-blue',
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-1', 'answerId', 'answer-blue',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.4, 'hasNoShares', false, 'hasShares', false, 'hasYesShares', false,
     'invested', 0, 'loan', 0, 'marginLoan', 0, 'maxSharesOutcome', null,
     'totalShares', '{"YES": 0, "NO": 0}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 0}'::jsonb,
     'payout', 0, 'totalAmountSold', 0, 'totalAmountInvested', 0,
     'profit', 0, 'profitPercent', 0
   ), false, false, false, 0, 0, 0, 0, 0),
  ('test-user-1', 'test-multi-1', NULL,
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-1', 'answerId', null,
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', null, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 2.1, 'loan', 0, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 3}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 2.1}'::jsonb,
     'payout', 2.1, 'totalAmountSold', 0, 'totalAmountInvested', 2.1,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 3, 0, 0, 0, 0)
ON CONFLICT (user_id, contract_id, COALESCE(answer_id, '')) DO NOTHING;

-- Loan-coverage market: test-user-1 holds NO on two answers with free loans.
-- loans-a (NO=5, loan=1) will end at finalYes=0 → loan fully repaid.
-- loans-b (NO=3, loan=1) will end at finalYes=2 → loan carried forward.
-- Expected: totalNo=8, effYes {a:3,b:5,c:8}, min=3, cash=3, loanPaid=1,
-- balance net +2.
INSERT INTO contracts (
  id, slug, question, creator_id, mechanism, outcome_type,
  created_time, close_time, visibility, data
)
VALUES (
  'test-multi-loans',
  'loan-carrying-market',
  'Loan carrying market for rebalance testing',
  'test-user-1',
  'cpmm-multi-1',
  'MULTIPLE_CHOICE',
  now(),
  now() + interval '30 days',
  'public',
  jsonb_build_object(
    'id', 'test-multi-loans', 'slug', 'loan-carrying-market',
    'question', 'Loan carrying market for rebalance testing',
    'creatorId', 'test-user-1', 'creatorName', 'Test User',
    'creatorUsername', 'testuser', 'mechanism', 'cpmm-multi-1',
    'outcomeType', 'MULTIPLE_CHOICE', 'shouldAnswersSumToOne', true,
    'addAnswersMode', 'DISABLED', 'totalLiquidity', 300, 'subsidyPool', 0,
    'volume', 0, 'volume24Hours', 0, 'isResolved', false,
    'visibility', 'public', 'elasticity', 0.5,
    'collectedFees', '{"creatorFee": 0, "platformFee": 0, "liquidityFee": 0}'::jsonb,
    'uniqueBettorCount', 1,
    'profitCached', '{"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0}'::jsonb,
    'creatorTraders', '{"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0}'::jsonb,
    'description', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Loan-coverage test."}]}]}'::jsonb,
    'createdTime', (extract(epoch from now()) * 1000)::bigint,
    'closeTime', (extract(epoch from (now() + interval '30 days')) * 1000)::bigint,
    'lastUpdatedTime', (extract(epoch from now()) * 1000)::bigint,
    'token', 'MANA'
  )
) ON CONFLICT (id) DO NOTHING;

INSERT INTO answers (
  id, contract_id, index, text, user_id, created_time,
  pool_yes, pool_no, prob, total_liquidity, subsidy_pool, volume
) VALUES
  ('loans-a', 'test-multi-loans', 0, 'Answer A', 'test-user-1', now(), 70, 30, 0.3, 100, 0, 0),
  ('loans-b', 'test-multi-loans', 1, 'Answer B', 'test-user-1', now(), 70, 30, 0.3, 100, 0, 0),
  ('loans-c', 'test-multi-loans', 2, 'Answer C', 'test-user-1', now(), 60, 40, 0.4, 100, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_contract_metrics (
  user_id, contract_id, answer_id, data,
  has_shares, has_no_shares, has_yes_shares,
  total_shares_no, total_shares_yes, profit, loan, margin_loan
) VALUES
  ('test-user-1', 'test-multi-loans', 'loans-a',
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-loans', 'answerId', 'loans-a',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.3, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 3.5, 'loan', 1, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 5}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 3.5}'::jsonb,
     'payout', 3.5, 'totalAmountSold', 0, 'totalAmountInvested', 3.5,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 5, 0, 0, 1, 0),
  ('test-user-1', 'test-multi-loans', 'loans-b',
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-loans', 'answerId', 'loans-b',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.3, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 2.1, 'loan', 1, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 3}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 2.1}'::jsonb,
     'payout', 2.1, 'totalAmountSold', 0, 'totalAmountInvested', 2.1,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 3, 0, 0, 1, 0),
  ('test-user-1', 'test-multi-loans', 'loans-c',
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-loans', 'answerId', 'loans-c',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.4, 'hasNoShares', false, 'hasShares', false, 'hasYesShares', false,
     'invested', 0, 'loan', 0, 'marginLoan', 0, 'maxSharesOutcome', null,
     'totalShares', '{"YES": 0, "NO": 0}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 0}'::jsonb,
     'payout', 0, 'totalAmountSold', 0, 'totalAmountInvested', 0,
     'profit', 0, 'profitPercent', 0
   ), false, false, false, 0, 0, 0, 0, 0),
  ('test-user-1', 'test-multi-loans', NULL,
   jsonb_build_object(
     'userId', 'test-user-1', 'contractId', 'test-multi-loans', 'answerId', null,
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', null, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 5.6, 'loan', 2, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 8}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 5.6}'::jsonb,
     'payout', 5.6, 'totalAmountSold', 0, 'totalAmountInvested', 5.6,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 8, 0, 0, 2, 0)
ON CONFLICT (user_id, contract_id, COALESCE(answer_id, '')) DO NOTHING;

-- Underwater scenario: test-user-underwater has balance=1 but loan=5 on an
-- answer that will zero out. rebalance would push balance to -4 from +1 →
-- sell-shares-style guard throws 403.
INSERT INTO users (id, name, username, balance, total_deposits, created_time, data)
VALUES (
  'test-user-underwater', 'Underwater User', 'underwater',
  1, 10, now(),
  '{
    "id": "test-user-underwater", "name": "Underwater User",
    "username": "underwater", "avatarUrl": "", "balance": 1,
    "totalDeposits": 10, "createdTime": 1700000000000,
    "profitCached": {"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0},
    "creatorTraders": {"daily": 0, "weekly": 0, "monthly": 0, "allTime": 0},
    "nextLoanCached": 0, "followerCountCached": 0,
    "isBannedFromPosting": false,
    "blockedUserIds": [], "blockedByUserIds": [],
    "blockedContractIds": [], "blockedGroupSlugs": [],
    "isAdvancedTrader": true
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO private_users (id, data)
VALUES (
  'test-user-underwater',
  '{
    "id": "test-user-underwater", "email": "underwater@example.com",
    "notificationPreferences": {}, "blockedUserIds": [],
    "blockedByUserIds": [], "blockedContractIds": [], "blockedGroupSlugs": []
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Position on test-multi-loans for underwater user: NO=5 on loans-a w/ loan=5,
-- NO=2 on loans-b w/ no loan. totalNo=7, min=2, cash=2, loanPaid=5 (a's loan)
-- since finalYes[a]=0 and finalYes[b]=3. Balance: 1 + 2 - 5 = -2 → 403.
INSERT INTO user_contract_metrics (
  user_id, contract_id, answer_id, data,
  has_shares, has_no_shares, has_yes_shares,
  total_shares_no, total_shares_yes, profit, loan, margin_loan
) VALUES
  ('test-user-underwater', 'test-multi-loans', 'loans-a',
   jsonb_build_object(
     'userId', 'test-user-underwater', 'contractId', 'test-multi-loans', 'answerId', 'loans-a',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.3, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 3.5, 'loan', 5, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 5}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 3.5}'::jsonb,
     'payout', 3.5, 'totalAmountSold', 0, 'totalAmountInvested', 3.5,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 5, 0, 0, 5, 0),
  ('test-user-underwater', 'test-multi-loans', 'loans-b',
   jsonb_build_object(
     'userId', 'test-user-underwater', 'contractId', 'test-multi-loans', 'answerId', 'loans-b',
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', 0.3, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 1.4, 'loan', 0, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 2}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 1.4}'::jsonb,
     'payout', 1.4, 'totalAmountSold', 0, 'totalAmountInvested', 1.4,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 2, 0, 0, 0, 0),
  ('test-user-underwater', 'test-multi-loans', NULL,
   jsonb_build_object(
     'userId', 'test-user-underwater', 'contractId', 'test-multi-loans', 'answerId', null,
     'lastBetTime', (extract(epoch from now()) * 1000)::bigint,
     'lastProb', null, 'hasNoShares', true, 'hasShares', true, 'hasYesShares', false,
     'invested', 4.9, 'loan', 5, 'marginLoan', 0, 'maxSharesOutcome', 'NO',
     'totalShares', '{"YES": 0, "NO": 7}'::jsonb,
     'totalSpent', '{"YES": 0, "NO": 4.9}'::jsonb,
     'payout', 4.9, 'totalAmountSold', 0, 'totalAmountInvested', 4.9,
     'profit', 0, 'profitPercent', 0
   ), true, true, false, 7, 0, 0, 5, 0)
ON CONFLICT (user_id, contract_id, COALESCE(answer_id, '')) DO NOTHING;
