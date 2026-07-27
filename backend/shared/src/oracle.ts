import { SupabaseDirectClient } from './supabase/init'
import { bulkInsertQuery } from './supabase/utils'

export const MANIFOLD_DAU_FEED_ID = 'manifold-dau'
export const TRUMP_APPROVAL_FEED_ID = 'trump-approval-rating'
export const ECI_FRONTIER_FEED_ID = 'eci-frontier'
export const BTC_USD_FEED_ID = 'btc-usd'
export const UK_GRID_CARBON_FEED_ID = 'uk-grid-carbon'
export const OPENROUTER_OPEN_WEIGHT_FEED_ID = 'openrouter-open-weight-share'

// Append oracle price points for a feed. Published history is immutable:
// duplicate (feed_id, ts) values remain unchanged even if a source later
// restates them. Timestamps are epoch millis; converted to ISO strings so
// postgres can coerce them to timestamptz.
export const insertOraclePrices = async (
  pg: SupabaseDirectClient,
  feedId: string,
  points: { ts: number; price: number }[]
) => {
  if (points.length === 0) return
  const rows = points.map((point) => ({
    feed_id: feedId,
    ts: new Date(point.ts).toISOString(),
    price: point.price,
  }))
  const query = bulkInsertQuery('oracle_prices', rows, false)
  await pg.none(`${query} on conflict (feed_id, ts) do nothing`)
}
