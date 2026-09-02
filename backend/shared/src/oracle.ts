import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { OraclePoint, validateBasicOraclePoint } from 'common/perps/oracle'

import { SupabaseDirectClient } from './supabase/init'
import { bulkInsertQuery } from './supabase/utils'

export const MANIFOLD_DAU_FEED_ID = 'manifold-dau'
export const TRUMP_APPROVAL_FEED_ID = 'trump-approval-rating'
export const BTC_USD_FEED_ID = 'btc-usd'
export const OPENROUTER_OPEN_WEIGHT_FEED_ID = 'openrouter-open-weight-share'
export const SPYX_USD_FEED_ID = 'spyx-usd'
export const QQQX_USD_FEED_ID = 'qqqx-usd'
export const GLDX_USD_FEED_ID = 'gldx-usd'
export const NVDAX_USD_FEED_ID = 'nvdax-usd'
// VoteHub published averages beyond Trump approval. Same publisher, same
// licence, different answer key — see backend/shared/src/votehub-feeds.ts.
export const VOTEHUB_GENERIC_BALLOT_2026_FEED_ID = 'votehub-generic-ballot-2026'
export const VANCE_FAVORABILITY_FEED_ID = 'vance-favorability'

// Append oracle price points for a feed. Published history is immutable:
// duplicate (feed_id, ts) values remain unchanged even if a source later
// restates them. Timestamps are epoch millis; converted to ISO strings so
// postgres can coerce them to timestamptz.
export const insertOraclePrices = async (
  pg: SupabaseDirectClient,
  feedId: string,
  points: readonly OraclePoint[]
) => {
  if (points.length === 0) return
  const requiresSourceTs = getOracleAttribution(feedId)?.showAsOf === true
  const rows = points.map((point) => {
    const rejection = validateBasicOraclePoint(point)
    if (rejection)
      throw new Error(`Refusing invalid ${feedId} oracle point: ${rejection}`)
    if (requiresSourceTs && point.sourceTs == null)
      throw new Error(
        `Oracle feed ${feedId} requires a provider source timestamp for attribution`
      )
    return {
      feed_id: feedId,
      ts: new Date(point.ts).toISOString(),
      price: point.price,
      source_ts:
        point.sourceTs == null ? null : new Date(point.sourceTs).toISOString(),
    }
  })
  const query = bulkInsertQuery('oracle_prices', rows, false)
  await pg.none(`${query} on conflict (feed_id, ts) do nothing`)
}
