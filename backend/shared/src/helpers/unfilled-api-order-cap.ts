import { APIError } from 'common/api/utils'
import { MINUTE_MS } from 'common/util/time'
import { SupabaseDirectClient } from 'shared/supabase/init'

// An API limit order that rests and never fills is not a trade, but it still
// costs a contract_bets row, an entry in every index on that table, and a
// rewrite when it expires or is cancelled. In 2026 a market-making bot
// re-quoting with 2-second expirations placed ~270k of them a day with a fill
// rate of 0.003%, outnumbering every real trade on the site 10 to 1. Orders that
// fill don't count toward this cap, so quoting that actually provides liquidity
// is never limited, only churn.
export const MAX_UNFILLED_API_ORDERS_PER_DAY = 50_000

// Each API process re-counts a user at most this often, so a user can overshoot
// the cap by their order rate times this window per process, which is small
// next to the cap.
export const UNFILLED_API_ORDER_RECOUNT_MS = MINUTE_MS

type CachedCount = { count: number; countedAt: number }
const countsByUserId = new Map<string, CachedCount>()

export const assertUnderUnfilledApiOrderCap = async (
  pg: SupabaseDirectClient,
  userId: string,
  now = Date.now()
) => {
  let cached = countsByUserId.get(userId)
  if (!cached || now - cached.countedAt >= UNFILLED_API_ORDER_RECOUNT_MS) {
    cached = { count: await countUnfilledApiOrders(pg, userId), countedAt: now }
    countsByUserId.set(userId, cached)
    pruneStaleCounts(now)
  }
  if (cached.count >= MAX_UNFILLED_API_ORDERS_PER_DAY) {
    throw new APIError(
      429,
      `You have placed ${MAX_UNFILLED_API_ORDERS_PER_DAY.toLocaleString()} API limit orders in the last 24 hours that never filled. ` +
        `New API limit orders are paused until that count drops. Market orders still work. ` +
        `Re-placing short-lived orders counts against this limit, so leave orders up longer instead.`
    )
  }
}

// Stops at the cap, so for a bot over the limit this reads one bounded range
// of its own rows rather than its whole day.
const countUnfilledApiOrders = (pg: SupabaseDirectClient, userId: string) =>
  pg.one(
    `select count(*)::int as n from (
       select 1 from contract_bets
       where user_id = $1
         and created_time > now() - interval '1 day'
         and is_api
         and amount = 0
         and not is_redemption
       limit $2
     ) recent`,
    [userId, MAX_UNFILLED_API_ORDERS_PER_DAY],
    (r: { n: number }) => r.n
  )

const pruneStaleCounts = (now: number) => {
  if (countsByUserId.size < 10_000) return
  for (const [userId, { countedAt }] of countsByUserId) {
    if (now - countedAt >= UNFILLED_API_ORDER_RECOUNT_MS)
      countsByUserId.delete(userId)
  }
}

export const resetUnfilledApiOrderCountsForTests = () => countsByUserId.clear()
