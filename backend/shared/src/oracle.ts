import { SupabaseDirectClient } from './supabase/init'
import { bulkUpsert } from './supabase/utils'

export const MANIFOLD_DAU_FEED_ID = 'manifold-dau'
export const TRUMP_APPROVAL_FEED_ID = 'trump-approval-rating'

// Upsert oracle price points for a feed. Idempotent on (feed_id, ts) — safe
// to re-run with the same inputs. Timestamps are epoch millis; converted to
// ISO strings so postgres can coerce to timestamptz.
export const upsertOraclePrices = async (
  pg: SupabaseDirectClient,
  feedId: string,
  points: { ts: number; price: number }[]
) => {
  if (points.length === 0) return
  const rows = points.map((p) => ({
    feed_id: feedId,
    ts: new Date(p.ts).toISOString(),
    price: p.price,
  }))
  await bulkUpsert(pg, 'oracle_prices', ['feed_id', 'ts'], rows)
}
