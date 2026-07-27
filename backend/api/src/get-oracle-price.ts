import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getOraclePrice: APIHandler<'get-oracle-price'> = async (body) => {
  const { feedId } = body
  const pg = createSupabaseDirectClient()
  const row = await pg.oneOrNone<{
    ts: string
    price: number | string
    source_ts: string | null
  }>(
    `select ts, price, source_ts from oracle_prices
     where feed_id = $1
     order by ts desc
     limit 1`,
    [feedId]
  )
  if (!row) return { latest: null }
  const sourceTs =
    row.source_ts == null ? undefined : new Date(row.source_ts).getTime()
  return {
    latest: {
      feedId,
      price: Number(row.price),
      ts: new Date(row.ts).getTime(),
      ...(sourceTs == null ? {} : { sourceTs }),
    },
  }
}

export const getOraclePriceSeries: APIHandler<
  'get-oracle-price-series'
> = async (body) => {
  const { feedId, since, limit = 5000, bucketSeconds } = body
  const pg = createSupabaseDirectClient()
  // Return the *most recent* N points (newest first, then reversed to asc for
  // charting). If `since` is provided we also filter to points >= since, but
  // we still cap at `limit` most-recent rows inside the window.
  //
  // With `bucketSeconds`, downsample to the LAST point of each bucket (its
  // real ts, not the bucket edge): the chart's gap-break and outage handling
  // key off genuine timestamps, and empty buckets simply produce no row, so
  // feed outages still render as gaps rather than interpolated lines.
  const rows = bucketSeconds
    ? await pg.manyOrNone<{ ts: string; price: number | string }>(
        `select ts, price from (
           select distinct on (floor(extract(epoch from ts) / $4))
             floor(extract(epoch from ts) / $4) as bucket, ts, price
           from oracle_prices
           where feed_id = $1
             and ($2::bigint is null or extract(epoch from ts) * 1000 >= $2::bigint)
           order by floor(extract(epoch from ts) / $4) desc, ts desc
           limit $3
         ) sub
         order by ts asc`,
        [feedId, since ?? null, limit, bucketSeconds]
      )
    : await pg.manyOrNone<{ ts: string; price: number | string }>(
        `select ts, price from (
           select ts, price from oracle_prices
           where feed_id = $1
             and ($2::bigint is null or extract(epoch from ts) * 1000 >= $2::bigint)
           order by ts desc
           limit $3
         ) sub
         order by ts asc`,
        [feedId, since ?? null, limit]
      )
  return rows.map((r) => ({
    ts: new Date(r.ts).getTime(),
    price: Number(r.price),
  }))
}
