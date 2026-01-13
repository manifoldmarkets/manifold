import { ANNUAL_INTEREST_RATE, INTEREST_ENABLED } from 'common/economy'
import { ContractToken } from 'common/contract'
import { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'
import { Payout } from 'common/payouts'

/**
 * Calculate share-days for all users who ever held positions in a contract.
 * This tracks the time-weighted position for each user, even if they sold out.
 *
 * Uses SQL window functions to compute time-weighted shares.
 */
async function calculateAllUserShareDays(
  pg: SupabaseDirectClient | SupabaseTransaction,
  contractId: string,
  answerId: string | undefined,
  endTime: number
): Promise<
  Array<{
    userId: string
    yesShareDays: number
    noShareDays: number
  }>
> {
  const endTimestamp = new Date(endTime).toISOString()

  const results = await pg.manyOrNone<{
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
        LEAD(created_time, 1, $2::timestamptz) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as next_time
      FROM contract_bets
      WHERE contract_id = $1
        AND NOT COALESCE(is_redemption, false)
        -- Exclude unfilled limit orders
        AND (is_filled IS NULL OR is_filled = true)
        -- Exclude cancelled orders
        AND COALESCE(is_cancelled, false) = false
        -- Exclude old interest claim bets to prevent compounding
        AND NOT COALESCE((data->>'isInterestClaim')::boolean, false)
        -- Filter by answerId for multi-answer markets
        AND ($3::text IS NULL OR answer_id = $3)
    )
    SELECT 
      user_id,
      COALESCE(SUM(
        GREATEST(yes_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ), 0) as yes_share_days,
      COALESCE(SUM(
        GREATEST(no_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ), 0) as no_share_days
    FROM share_timeline
    GROUP BY user_id
    HAVING SUM(GREATEST(yes_shares_at_time, 0) * EXTRACT(EPOCH FROM (next_time - created_time))) > 0
        OR SUM(GREATEST(no_shares_at_time, 0) * EXTRACT(EPOCH FROM (next_time - created_time))) > 0
    `,
    [contractId, endTimestamp, answerId ?? null]
  )

  return results.map((r) => ({
    userId: r.user_id,
    yesShareDays: r.yes_share_days ?? 0,
    noShareDays: r.no_share_days ?? 0,
  }))
}

/**
 * Calculate interest payouts as mana for all users at resolution time.
 *
 * Interest is calculated as:
 *   interestMana = shareDays * ANNUAL_RATE / 365 * resolutionValue
 *
 * Where resolutionValue converts shares to mana:
 *   - YES resolution: 1 for YES share-days, 0 for NO share-days
 *   - NO resolution: 0 for YES share-days, 1 for NO share-days
 *   - PROB% resolution: prob for YES share-days, (1-prob) for NO share-days
 *   - CANCEL: 0 for all (no interest on cancelled markets)
 *
 * This pays interest to ALL users who ever held positions, including those
 * who sold out before resolution.
 */
export async function calculateInterestPayouts(
  pg: SupabaseDirectClient | SupabaseTransaction,
  contractId: string,
  answerId: string | undefined,
  endTime: number,
  token: ContractToken,
  outcome: string,
  resolutionProbability?: number
): Promise<Payout[]> {
  if (!INTEREST_ENABLED) return []
  if (token !== 'MANA') return []

  // No interest on cancelled markets
  if (outcome === 'CANCEL') return []

  // Check contract eligibility (must be public and ranked)
  const contract = await pg.oneOrNone<{
    visibility: string
    is_ranked: string | null
  }>(
    `SELECT visibility, data->>'isRanked' as is_ranked FROM contracts WHERE id = $1`,
    [contractId]
  )

  if (!contract) return []
  if (contract.visibility !== 'public') return []
  if (contract.is_ranked === 'false') return []

  // Calculate resolution values (how much mana per share)
  let yesResolutionValue: number
  let noResolutionValue: number

  if (outcome === 'YES') {
    yesResolutionValue = 1
    noResolutionValue = 0
  } else if (outcome === 'NO') {
    yesResolutionValue = 0
    noResolutionValue = 1
  } else if (outcome === 'MKT' && resolutionProbability !== undefined) {
    yesResolutionValue = resolutionProbability
    noResolutionValue = 1 - resolutionProbability
  } else {
    // Unknown resolution type, no interest
    return []
  }

  // Get share-days for all users
  const shareDaysResults = await calculateAllUserShareDays(
    pg,
    contractId,
    answerId,
    endTime
  )

  if (shareDaysResults.length === 0) return []

  // Calculate interest mana payouts
  const payouts: Payout[] = []

  for (const { userId, yesShareDays, noShareDays } of shareDaysResults) {
    const yesInterestMana =
      ((yesShareDays * ANNUAL_INTEREST_RATE) / 365) * yesResolutionValue
    const noInterestMana =
      ((noShareDays * ANNUAL_INTEREST_RATE) / 365) * noResolutionValue

    const totalInterestMana = yesInterestMana + noInterestMana

    if (totalInterestMana > 0) {
      payouts.push({
        userId,
        payout: totalInterestMana,
      })
    }
  }

  return payouts
}
