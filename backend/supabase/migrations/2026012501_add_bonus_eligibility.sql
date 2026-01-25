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
-- 2. Are not banned from posting
-- 3. Are not deleted
-- 4. Have placed at least one bet (real engagement)
-- 5. Were not already set to 'verified' above

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
  -- Exclude banned users
  AND (data->>'isBannedFromPosting')::boolean IS NOT TRUE
  -- Exclude deleted users
  AND (data->>'userDeleted')::boolean IS NOT TRUE
  -- Require at least one bet (shows real engagement)
  AND (data->>'lastBetTime') IS NOT NULL
  -- Don't overwrite if already set (e.g., already verified in Step 1)
  AND data->>'bonusEligibility' IS NULL;

-- Remove the old iDenfy fields from user data (optional cleanup)
-- Uncomment these lines after verifying the migration works correctly
-- UPDATE users SET data = data - 'idenfyStatus' WHERE data ? 'idenfyStatus';
-- UPDATE users SET data = data - 'idenfyVerifiedTime' WHERE data ? 'idenfyVerifiedTime';

-- Create an index on bonusEligibility for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_bonus_eligibility 
ON users ((data->>'bonusEligibility'));
