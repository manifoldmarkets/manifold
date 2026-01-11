import { ContractToken } from 'common/contract'
import { ANNUAL_INTEREST_RATE, INTEREST_ENABLED } from 'common/economy'
import { SupabaseDirectClient } from './supabase/init'

export type ShareDaysResult = {
  userId: string
  answerId: string | null
  yesShareDays: number
  noShareDays: number
}

export type InterestPayout = {
  userId: string
  answerId: string | null
  interest: number
  yesShareDays: number
  noShareDays: number
}

/**
 * Calculate share-days for a market at resolution time.
 *
 * Uses SQL window functions to compute time-weighted shares ("share-days")
 * without loading all bets into memory.
 *
 * Tracks YES and NO shares separately so we can value them at resolution price:
 * - YES shares worth resolution_prob (1 if resolves YES, 0 if NO)
 * - NO shares worth (1 - resolution_prob)
 *
 * Example: Buy 100 mana YES at 50% → 200 shares, hold 1 year, resolves YES
 * - Share-days: 200 * 365 = 73,000
 * - Interest: 73,000 * $1 * 0.05 / 365 = $10
 */
export async function calculateShareDays(
  pg: SupabaseDirectClient,
  contractId: string,
  endTime: number,
  answerId: string | undefined
): Promise<ShareDaysResult[]> {
  const endTimestamp = new Date(endTime).toISOString()

  const results = await pg.manyOrNone<{
    user_id: string
    answer_id: string | null
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
        -- Exclude unfilled limit orders (market orders have is_filled = NULL)
        AND (is_filled IS NULL OR is_filled = true)
        -- Exclude cancelled orders
        AND COALESCE(is_cancelled, false) = false
        -- Filter by answerId for multi-answer markets
        AND ($3::text IS NULL OR answer_id = $3)
    )
    SELECT 
      user_id,
      answer_id,
      SUM(
        GREATEST(yes_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ) as yes_share_days,
      SUM(
        GREATEST(no_shares_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ) as no_share_days
    FROM share_timeline
    GROUP BY user_id, answer_id
    HAVING SUM(GREATEST(yes_shares_at_time, 0) * EXTRACT(EPOCH FROM (next_time - created_time))) > 0
        OR SUM(GREATEST(no_shares_at_time, 0) * EXTRACT(EPOCH FROM (next_time - created_time))) > 0
    `,
    [contractId, endTimestamp, answerId ?? null]
  )

  return results.map((r) => ({
    userId: r.user_id,
    answerId: r.answer_id,
    yesShareDays: r.yes_share_days ?? 0,
    noShareDays: r.no_share_days ?? 0,
  }))
}

/**
 * Calculate interest payouts for a market at resolution time.
 *
 * Interest is based on share value at resolution:
 * - YES shares × resolution_prob (1 if YES, 0 if NO, or MKT prob)
 * - NO shares × (1 - resolution_prob)
 *
 * This means losers get 0 interest, winners get interest proportional to payout.
 */
export async function calculateInterestPayouts(
  pg: SupabaseDirectClient,
  contractId: string,
  resolutionTime: number,
  answerId: string | undefined,
  token: ContractToken,
  resolutionProb: number
): Promise<InterestPayout[]> {
  // Feature flag - easy kill switch
  if (!INTEREST_ENABLED) return []

  // Only MANA markets earn interest
  if (token !== 'MANA') return []

  // Check if market is eligible for interest (must be listed and ranked)
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

  const shareDaysResults = await calculateShareDays(
    pg,
    contractId,
    resolutionTime,
    answerId
  )

  return shareDaysResults
    .map((r) => {
      // Value share-days at resolution price
      const valueWeightedShareDays =
        r.yesShareDays * resolutionProb + r.noShareDays * (1 - resolutionProb)

      const interest = (valueWeightedShareDays * ANNUAL_INTEREST_RATE) / 365

      return {
        userId: r.userId,
        answerId: r.answerId,
        yesShareDays: r.yesShareDays,
        noShareDays: r.noShareDays,
        interest,
      }
    })
    .filter((p) => p.interest > 0)
}

/**
 * Calculate interest for a specific user selling shares.
 *
 * Uses current market probability to value the sold shares.
 * Called immediately when user sells, so they get interest right away.
 *
 * Important: Subtracts already-paid interest from previous sells to avoid
 * paying interest on the same share-days multiple times.
 */
export async function calculateInterestForSell(
  pg: SupabaseDirectClient,
  contractId: string,
  userId: string,
  answerId: string | undefined,
  sellTime: number,
  currentProb: number,
  token: ContractToken
): Promise<{ interest: number; yesShareDays: number; noShareDays: number }> {
  // Feature flag - easy kill switch
  if (!INTEREST_ENABLED) return { interest: 0, yesShareDays: 0, noShareDays: 0 }

  // Only MANA markets earn interest
  if (token !== 'MANA') return { interest: 0, yesShareDays: 0, noShareDays: 0 }

  // Check if market is eligible for interest (must be listed and ranked)
  const contract = await pg.oneOrNone<{
    visibility: string
    is_ranked: boolean | null
  }>(
    `SELECT visibility, data->>'isRanked' as is_ranked FROM contracts WHERE id = $1`,
    [contractId]
  )
  if (!contract) return { interest: 0, yesShareDays: 0, noShareDays: 0 }
  if (contract.visibility !== 'public') return { interest: 0, yesShareDays: 0, noShareDays: 0 }
  if (contract.is_ranked === false) return { interest: 0, yesShareDays: 0, noShareDays: 0 }

  const sellTimestamp = new Date(sellTime).toISOString()

  // Get share-days up to the sell time for this specific user
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
        SUM(CASE WHEN outcome = 'YES' THEN shares ELSE 0 END) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as yes_shares_at_time,
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
        AND (is_filled IS NULL OR is_filled = true)
        AND COALESCE(is_cancelled, false) = false
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
    [contractId, userId, answerId ?? null, sellTimestamp]
  )

  if (!result) {
    return { interest: 0, yesShareDays: 0, noShareDays: 0 }
  }

  const yesShareDays = result.yes_share_days ?? 0
  const noShareDays = result.no_share_days ?? 0

  // Value at current probability
  const valueWeightedShareDays =
    yesShareDays * currentProb + noShareDays * (1 - currentProb)

  const grossInterest = (valueWeightedShareDays * ANNUAL_INTEREST_RATE) / 365

  // Subtract already-paid interest from previous sells to avoid double-payment
  const alreadyPaid = await pg.oneOrNone<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM txns 
     WHERE category = 'INTEREST_PAYOUT'
       AND to_id = $1
       AND data->'data'->>'contractId' = $2
       AND ($3::text IS NULL OR data->'data'->>'answerId' = $3)`,
    [userId, contractId, answerId ?? null]
  )

  const interest = Math.max(0, grossInterest - (alreadyPaid?.total ?? 0))

  return { interest, yesShareDays, noShareDays }
}
