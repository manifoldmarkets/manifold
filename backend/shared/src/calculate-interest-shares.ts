import { ANNUAL_INTEREST_RATE, INTEREST_ENABLED } from 'common/economy'
import { ContractToken } from 'common/contract'
import { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'

/**
 * Calculate share-days for a user's position, excluding interest claim bets.
 * This ensures we don't compound interest (interest on interest).
 *
 * Uses SQL window functions to compute time-weighted shares.
 */
async function calculateShareDays(
  pg: SupabaseDirectClient | SupabaseTransaction,
  contractId: string,
  userId: string,
  answerId: string | undefined,
  endTime: number
): Promise<{ yesShareDays: number; noShareDays: number }> {
  const endTimestamp = new Date(endTime).toISOString()

  const result = await pg.oneOrNone<{
    yes_share_days: number
    no_share_days: number
  }>(
    `
    WITH share_timeline AS (
      SELECT 
        user_id,
        answer_id,
        created_time,
        bet_id,
        -- Running total of YES shares
        SUM(CASE WHEN outcome = 'YES' THEN shares ELSE 0 END) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as yes_shares_at_time,
        -- Running total of NO shares
        SUM(CASE WHEN outcome = 'NO' THEN shares ELSE 0 END) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as no_shares_at_time,
        LEAD(created_time, 1, $4::timestamptz) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as next_time
      FROM contract_bets
      WHERE contract_id = $1
        AND user_id = $2
        AND NOT COALESCE(is_redemption, false)
        -- Exclude unfilled limit orders
        AND (is_filled IS NULL OR is_filled = true)
        -- Exclude cancelled orders
        AND COALESCE(is_cancelled, false) = false
        -- Exclude interest claim bets (no compounding)
        AND NOT COALESCE((data->>'isInterestClaim')::boolean, false)
        -- Filter by answerId for multi-answer markets
        AND ($3::text IS NULL OR answer_id = $3)
    )
    SELECT 
      COALESCE(SUM(
        GREATEST(yes_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ), 0) as yes_share_days,
      COALESCE(SUM(
        GREATEST(no_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ), 0) as no_share_days
    FROM share_timeline
    `,
    [contractId, userId, answerId ?? null, endTimestamp]
  )

  return {
    yesShareDays: result?.yes_share_days ?? 0,
    noShareDays: result?.no_share_days ?? 0,
  }
}

/**
 * Query the total interest shares already claimed by a user for a contract.
 */
async function getClaimedInterestShares(
  pg: SupabaseDirectClient | SupabaseTransaction,
  contractId: string,
  userId: string,
  answerId: string | undefined
): Promise<{ yesShares: number; noShares: number }> {
  const result = await pg.oneOrNone<{
    yes_shares: number
    no_shares: number
  }>(
    `
    SELECT 
      COALESCE(SUM(CASE WHEN outcome = 'YES' THEN shares ELSE 0 END), 0) as yes_shares,
      COALESCE(SUM(CASE WHEN outcome = 'NO' THEN shares ELSE 0 END), 0) as no_shares
    FROM contract_bets
    WHERE contract_id = $1
      AND user_id = $2
      AND ($3::text IS NULL OR answer_id = $3)
      AND COALESCE((data->>'isInterestClaim')::boolean, false) = true
    `,
    [contractId, userId, answerId ?? null]
  )

  return {
    yesShares: result?.yes_shares ?? 0,
    noShares: result?.no_shares ?? 0,
  }
}

/**
 * Check if a contract is eligible for interest (must be MANA, listed, and ranked).
 */
async function isContractEligibleForInterest(
  pg: SupabaseDirectClient | SupabaseTransaction,
  contractId: string,
  token: ContractToken
): Promise<boolean> {
  if (!INTEREST_ENABLED) return false
  if (token !== 'MANA') return false

  const contract = await pg.oneOrNone<{
    visibility: string
    is_ranked: boolean | null
  }>(
    `SELECT visibility, data->>'isRanked' as is_ranked FROM contracts WHERE id = $1`,
    [contractId]
  )

  if (!contract) return false
  if (contract.visibility !== 'public') return false
  if (contract.is_ranked === false) return false

  return true
}

export type InterestSharesResult = {
  yesShares: number
  noShares: number
  yesShareDays: number
  noShareDays: number
}

/**
 * Calculate claimable interest shares for a user.
 *
 * Interest is calculated as: shareDays * ANNUAL_RATE / 365
 * No probability multiplier - interest is paid in shares, not mana.
 *
 * Returns net claimable shares (total accrued - already claimed).
 */
export async function calculateInterestShares(
  pg: SupabaseDirectClient | SupabaseTransaction,
  contractId: string,
  userId: string,
  answerId: string | undefined,
  endTime: number,
  token: ContractToken
): Promise<InterestSharesResult> {
  const noInterest = { yesShares: 0, noShares: 0, yesShareDays: 0, noShareDays: 0 }

  // Check eligibility
  const eligible = await isContractEligibleForInterest(pg, contractId, token)
  if (!eligible) return noInterest

  // Calculate share-days (excluding interest claim bets)
  const { yesShareDays, noShareDays } = await calculateShareDays(
    pg,
    contractId,
    userId,
    answerId,
    endTime
  )

  if (yesShareDays === 0 && noShareDays === 0) return noInterest

  // Calculate gross interest shares
  const grossYesShares = (yesShareDays * ANNUAL_INTEREST_RATE) / 365
  const grossNoShares = (noShareDays * ANNUAL_INTEREST_RATE) / 365

  // Subtract already-claimed shares
  const claimed = await getClaimedInterestShares(pg, contractId, userId, answerId)

  const netYesShares = Math.max(0, grossYesShares - claimed.yesShares)
  const netNoShares = Math.max(0, grossNoShares - claimed.noShares)

  return {
    yesShares: netYesShares,
    noShares: netNoShares,
    yesShareDays,
    noShareDays,
  }
}

/**
 * Calculate interest shares for all users with positions in a contract.
 * Used at resolution time to bulk claim interest.
 */
export async function calculateBulkInterestShares(
  pg: SupabaseDirectClient | SupabaseTransaction,
  contractId: string,
  answerId: string | undefined,
  endTime: number,
  token: ContractToken
): Promise<
  Array<{
    userId: string
    yesShares: number
    noShares: number
    yesShareDays: number
    noShareDays: number
  }>
> {
  if (!INTEREST_ENABLED) return []
  if (token !== 'MANA') return []

  // Check contract eligibility
  const contract = await pg.oneOrNone<{
    visibility: string
    is_ranked: boolean | null
  }>(
    `SELECT visibility, data->>'isRanked' as is_ranked FROM contracts WHERE id = $1`,
    [contractId]
  )

  if (!contract) return []
  if (contract.visibility !== 'public') return []
  if (contract.is_ranked === false) return []

  const endTimestamp = new Date(endTime).toISOString()

  // Calculate share-days for all users (excluding interest claim bets)
  const shareDaysResults = await pg.manyOrNone<{
    user_id: string
    yes_share_days: number
    no_share_days: number
  }>(
    `
    WITH share_timeline AS (
      SELECT 
        user_id,
        answer_id,
        created_time,
        bet_id,
        SUM(CASE WHEN outcome = 'YES' THEN shares ELSE 0 END) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as yes_shares_at_time,
        SUM(CASE WHEN outcome = 'NO' THEN shares ELSE 0 END) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as no_shares_at_time,
        LEAD(created_time, 1, $2::timestamptz) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as next_time
      FROM contract_bets
      WHERE contract_id = $1
        AND NOT COALESCE(is_redemption, false)
        AND (is_filled IS NULL OR is_filled = true)
        AND COALESCE(is_cancelled, false) = false
        AND NOT COALESCE((data->>'isInterestClaim')::boolean, false)
        AND ($3::text IS NULL OR answer_id = $3)
    )
    SELECT 
      user_id,
      SUM(
        GREATEST(yes_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ) as yes_share_days,
      SUM(
        GREATEST(no_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ) as no_share_days
    FROM share_timeline
    GROUP BY user_id
    HAVING SUM(GREATEST(yes_shares_at_time, 0) * EXTRACT(EPOCH FROM (next_time - created_time))) > 0
        OR SUM(GREATEST(no_shares_at_time, 0) * EXTRACT(EPOCH FROM (next_time - created_time))) > 0
    `,
    [contractId, endTimestamp, answerId ?? null]
  )

  if (shareDaysResults.length === 0) return []

  // Get already-claimed interest for all users
  const claimedResults = await pg.manyOrNone<{
    user_id: string
    yes_shares: number
    no_shares: number
  }>(
    `
    SELECT 
      user_id,
      COALESCE(SUM(CASE WHEN outcome = 'YES' THEN shares ELSE 0 END), 0) as yes_shares,
      COALESCE(SUM(CASE WHEN outcome = 'NO' THEN shares ELSE 0 END), 0) as no_shares
    FROM contract_bets
    WHERE contract_id = $1
      AND ($2::text IS NULL OR answer_id = $2)
      AND COALESCE((data->>'isInterestClaim')::boolean, false) = true
    GROUP BY user_id
    `,
    [contractId, answerId ?? null]
  )

  const claimedByUser = new Map(
    claimedResults.map((r) => [
      r.user_id,
      { yesShares: r.yes_shares ?? 0, noShares: r.no_shares ?? 0 },
    ])
  )

  // Calculate net claimable interest for each user
  return shareDaysResults
    .map((r) => {
      const yesShareDays = r.yes_share_days ?? 0
      const noShareDays = r.no_share_days ?? 0

      const grossYesShares = (yesShareDays * ANNUAL_INTEREST_RATE) / 365
      const grossNoShares = (noShareDays * ANNUAL_INTEREST_RATE) / 365

      const claimed = claimedByUser.get(r.user_id) ?? {
        yesShares: 0,
        noShares: 0,
      }

      const netYesShares = Math.max(0, grossYesShares - claimed.yesShares)
      const netNoShares = Math.max(0, grossNoShares - claimed.noShares)

      return {
        userId: r.user_id,
        yesShares: netYesShares,
        noShares: netNoShares,
        yesShareDays,
        noShareDays,
      }
    })
    .filter((r) => r.yesShares > 0 || r.noShares > 0)
}
