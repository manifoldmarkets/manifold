import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getOraclePrice: APIHandler<'get-oracle-price'> = async (body) => {
  const { feedId } = body
  const pg = createSupabaseDirectClient()
  const row = await pg.oneOrNone<{ ts: string; price: number | string }>(
    `select ts, price from oracle_prices
     where feed_id = $1
     order by ts desc
     limit 1`,
    [feedId]
  )
  if (!row) return { latest: null }
  return {
    latest: {
      feedId,
      price: Number(row.price),
      ts: new Date(row.ts).getTime(),
    },
  }
}

export const getOraclePriceSeries: APIHandler<
  'get-oracle-price-series'
> = async (body) => {
  const { feedId, since, limit = 5000 } = body
  const pg = createSupabaseDirectClient()
  // Return the *most recent* N points (newest first, then reversed to asc for
  // charting). If `since` is provided we also filter to points >= since, but
  // we still cap at `limit` most-recent rows inside the window.
  const rows = await pg.manyOrNone<{ ts: string; price: number | string }>(
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
