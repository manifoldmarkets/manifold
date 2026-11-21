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
  const { feedId, since, before, limit = 5000, bucketSeconds } = body
  const pg = createSupabaseDirectClient()
  // Return the *most recent* N points in the window (newest first, then
  // reversed to asc for charting). `since` sets the inclusive lower bound and
  // `before` the exclusive upper one; because the cap always keeps the newest
  // rows, `before` is the cursor that walks a feed backwards to its start —
  // pass the first ts of the previous page.
  //
  // Both bounds compare `ts` against a timestamptz rather than extracting an
  // epoch from it, which keeps them index conditions on (feed_id, ts) instead
  // of post-scan filters. The epoch form made a recent `since` read the feed's
  // entire history to return a handful of rows, and would have made every
  // `before` page do the same.
  //
  // With `bucketSeconds`, downsample to the LAST point of each bucket (its
  // real ts, not the bucket edge): the chart's gap-break and outage handling
  // key off genuine timestamps, and empty buckets simply produce no row, so
  // feed outages still render as gaps rather than interpolated lines.
  const rows = bucketSeconds
    ? await pg.manyOrNone<{ ts: string; price: number | string }>(
        `select ts, price from (
           select distinct on (floor(extract(epoch from ts) / $5))
             floor(extract(epoch from ts) / $5) as bucket, ts, price
           from oracle_prices
           where feed_id = $1
             and ($2::bigint is null or ts >= to_timestamp($2::bigint / 1000.0))
             and ($3::bigint is null or ts < to_timestamp($3::bigint / 1000.0))
           order by floor(extract(epoch from ts) / $5) desc, ts desc
           limit $4
         ) sub
         order by ts asc`,
        [feedId, since ?? null, before ?? null, limit, bucketSeconds]
      )
    : await pg.manyOrNone<{ ts: string; price: number | string }>(
        `select ts, price from (
           select ts, price from oracle_prices
           where feed_id = $1
             and ($2::bigint is null or ts >= to_timestamp($2::bigint / 1000.0))
             and ($3::bigint is null or ts < to_timestamp($3::bigint / 1000.0))
           order by ts desc
           limit $4
         ) sub
         order by ts asc`,
        [feedId, since ?? null, before ?? null, limit]
      )
  return rows.map((r) => ({
    ts: new Date(r.ts).getTime(),
    price: Number(r.price),
  }))
}
