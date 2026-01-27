-- Migration to add bonusEligibility field and grandfather existing users
-- This field determines who can receive site bonuses and participate in cash raffles

-- IMPORTANT: Order matters! Run iDenfy verified users FIRST so they get 'verified'
-- status instead of 'grandfathered'

-- Step 1: Set any users who were previously approved via iDenfy to 'verified'
UPDATE users
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{bonusEligibility}',
  '"verified"'
)
WHERE 
  (data->>'idenfyStatus') = 'approved'
  AND data->>'bonusEligibility' IS NULL;

-- Step 2: Grandfather existing users who:
-- 1. Were created before the cash raffles launch date
-- 2. Are not banned 
-- 3. Were not already set to 'verified' above

UPDATE users
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{bonusEligibility}',
  '"grandfathered"'
)
WHERE 
  -- All users created before this migration are grandfathered
  -- TODO: Adjust this date if you want a different cutoff
  created_time < NOW()
  -- Exclude users with any active ban in user_bans table (except modAlert which is just a warning)
  AND NOT EXISTS (
    SELECT 1 FROM user_bans ub
    WHERE ub.user_id = users.id
      AND ub.ban_type IN ('posting', 'marketControl', 'trading')
      AND ub.ended_at IS NULL  -- not manually ended
      AND (ub.end_time IS NULL OR ub.end_time > NOW())  -- no expiry or hasn't expired
  )
  -- Don't overwrite if already set (e.g., already verified in Step 1)
  AND data->>'bonusEligibility' IS NULL;

-- Step 3: Set users with active trading bans to 'ineligible'
-- This overrides any previous status (verified or grandfathered)
UPDATE users
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{bonusEligibility}',
  '"ineligible"'
)
WHERE EXISTS (
  SELECT 1 FROM user_bans ub
  WHERE ub.user_id = users.id
    AND ub.ban_type = 'trading'
    AND ub.ended_at IS NULL  -- not manually ended
    AND (ub.end_time IS NULL OR ub.end_time > NOW())  -- no expiry or hasn't expired
);

-- Remove the old iDenfy fields from user data (optional cleanup)
-- Uncomment these lines after verifying the migration works correctly
-- UPDATE users SET data = data - 'idenfyStatus' WHERE data ? 'idenfyStatus';
-- UPDATE users SET data = data - 'idenfyVerifiedTime' WHERE data ? 'idenfyVerifiedTime';

-- Create an index on bonusEligibility for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_bonus_eligibility 
ON users ((data->>'bonusEligibility'));
