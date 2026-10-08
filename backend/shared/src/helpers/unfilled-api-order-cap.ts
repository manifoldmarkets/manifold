import { APIError } from 'common/api/utils'
import { MINUTE_MS } from 'common/util/time'
import { SupabaseDirectClient } from 'shared/supabase/init'

// Targets order churn, not order volume. An API limit order counts here only
// if it never filled AND was gone (expired or cancelled) within a minute of
// being placed. Such an order is barely in the book long enough for anyone to
// trade against, but it still costs a contract_bets row, an entry in every
// index on that table, and a rewrite when it's cancelled.
//
// In 2026 one bot re-quoted with 2-second expirations: ~265k orders a day,
// all of them counting here, 2 fills a day. A market maker whose quotes rest
// for minutes, or a bot whose short-lived orders fill (immediate-or-cancel
// style), adds little or nothing. Peaks over two weeks, by UTC day: 14.7k
// (a market maker mostly quoting 10-minute orders), 3.4k, then < 1k.
export const MAX_SHORT_LIVED_UNFILLED_API_ORDERS_PER_DAY = 50_000
export const SHORT_LIVED_ORDER_SECONDS = 60

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
    cached = {
      count: await countShortLivedUnfilledApiOrders(pg, userId),
      countedAt: now,
    }
    countsByUserId.set(userId, cached)
    pruneStaleCounts(now)
  }
  if (cached.count >= MAX_SHORT_LIVED_UNFILLED_API_ORDERS_PER_DAY) {
    throw new APIError(
      429,
      `In the last 24 hours, ${MAX_SHORT_LIVED_UNFILLED_API_ORDERS_PER_DAY.toLocaleString()} of your API limit orders ` +
        `expired or were cancelled within ${SHORT_LIVED_ORDER_SECONDS} seconds without filling. ` +
        `New API limit orders are paused until that count drops. Orders that fill, or that stay up ` +
        `for at least ${SHORT_LIVED_ORDER_SECONDS} seconds, don't count, and market orders still work.`
    )
  }
}

// A short expiry counts as soon as the order is placed (it can only stop
// counting by filling). Otherwise the order counts once it's cancelled soon
// after placement: an unfilled order's only update is its cancellation, so
// updated_time is when it was cancelled. Stops at the cap, so a bot over the
// limit costs one bounded range of its own rows, not its whole day.
const countShortLivedUnfilledApiOrders = (
  pg: SupabaseDirectClient,
  userId: string
) =>
  pg.one(
    `select count(*)::int as n from (
       select 1 from contract_bets
       where user_id = $1
         and created_time > now() - interval '1 day'
         and is_api
         and amount = 0
         and not is_redemption
         and (
           expires_at - created_time < make_interval(secs => $3)
           or (is_cancelled and updated_time - created_time < make_interval(secs => $3))
         )
       limit $2
     ) recent`,
    [
      userId,
      MAX_SHORT_LIVED_UNFILLED_API_ORDERS_PER_DAY,
      SHORT_LIVED_ORDER_SECONDS,
    ],
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
