import { ContractToken } from 'common/contract'
import { ANNUAL_INTEREST_RATE, INTEREST_ENABLED } from 'common/economy'
import { SupabaseDirectClient } from './supabase/init'

export type InterestPayout = {
  userId: string
  answerId: string | null
  interest: number
  dollarDays: number
}

/**
 * Calculate interest payouts for a market at resolution time.
 *
 * Uses SQL window functions to compute time-weighted investment ("dollar-days")
 * without loading all bets into memory.
 *
 * For each user, calculates the integral of investment over time:
 * - Buy $100 on day 0, sells $30 on day 50, resolves day 100
 * - Dollar-days = 100*50 + 70*50 = 8,500
 * - Interest = 8,500 * 0.05 / 365 = $1.16
 */
export async function calculateInterestPayouts(
  pg: SupabaseDirectClient,
  contractId: string,
  resolutionTime: number,
  answerId: string | undefined,
  token: ContractToken
): Promise<InterestPayout[]> {
  // Feature flag - easy kill switch
  if (!INTEREST_ENABLED) return []

  // Only MANA markets earn interest
  if (token !== 'MANA') return []

  const resolutionTimestamp = new Date(resolutionTime).toISOString()

  const results = await pg.manyOrNone<{
    user_id: string
    answer_id: string | null
    dollar_days: number
  }>(
    `
    WITH investment_timeline AS (
      SELECT 
        user_id,
        answer_id,
        created_time,
        -- Running sum of net investment: buys add, sells subtract (amount is negative for sells)
        -- Redemptions excluded: they convert share pairs to cash, not a change in investment
        SUM(amount) OVER (
          PARTITION BY user_id, COALESCE(answer_id, '') 
          ORDER BY created_time, bet_id
        ) as invested_at_time,
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
        GREATEST(invested_at_time, 0) * 
        EXTRACT(EPOCH FROM (next_time - created_time)) / 86400
      ) as dollar_days
    FROM investment_timeline
    GROUP BY user_id, answer_id
    HAVING SUM(GREATEST(invested_at_time, 0) * EXTRACT(EPOCH FROM (next_time - created_time))) > 0
    `,
    [contractId, resolutionTimestamp, answerId ?? null]
  )

  return results.map((r) => ({
    userId: r.user_id,
    answerId: r.answer_id,
    dollarDays: r.dollar_days,
    interest: (r.dollar_days * ANNUAL_INTEREST_RATE) / 365,
  }))
}
