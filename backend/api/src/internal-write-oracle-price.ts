import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

// Append and immediately apply one oracle observation. This remains
// admin-gated, but it follows the same registry, bounds, jump, timestamp, and
// immutability rules as automated feed writers.
export const internalWriteOraclePrice: APIHandler<
  'internal-write-oracle-price'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const { feedId, ts, price } = body
  const pg = createSupabaseDirectClient()
  const point = { ts, price }

  const feed = getOracleFeed(feedId)
  if (!feed) throw new APIError(400, `Unknown oracle feed "${feedId}"`)

  const existing = await pg.oneOrNone<{
    ts: string
    price: number | string
  }>(
    `select ts, price from oracle_prices
     where feed_id = $1
       and ts = to_timestamp($2::double precision / 1000.0)`,
    [feedId, ts]
  )
  if (existing) {
    const existingPrice = Number(existing.price)
    if (existingPrice !== price)
      throw new APIError(
        409,
        `Oracle point ${feedId} @ ${ts} is immutable at ${existingPrice}`
      )
    await applyOraclePointToLivePerps(pg, feedId, {
      ts: new Date(existing.ts).getTime(),
      price: existingPrice,
    })
    return { success: true } as const
  }

  const latest = await pg.oneOrNone<{
    ts: string
    price: number | string
  }>(
    `select ts, price from oracle_prices
     where feed_id = $1
     order by ts desc
     limit 1`,
    [feedId]
  )
  const rejection = validateOraclePoint(
    feed,
    latest
      ? { ts: new Date(latest.ts).getTime(), price: Number(latest.price) }
      : null,
    point
  )
  if (rejection) throw new APIError(400, rejection)

  await insertOraclePrices(pg, feedId, [point])

  // Read after INSERT ... ON CONFLICT DO NOTHING to close the concurrent
  // writer race. Never apply the caller's value unless that exact value is the
  // immutable row that won.
  const stored = await pg.one<{ ts: string; price: number | string }>(
    `select ts, price from oracle_prices
     where feed_id = $1
       and ts = to_timestamp($2::double precision / 1000.0)`,
    [feedId, ts]
  )
  const storedPoint = {
    ts: new Date(stored.ts).getTime(),
    price: Number(stored.price),
  }
  if (storedPoint.price !== price)
    throw new APIError(
      409,
      `Oracle point ${feedId} @ ${ts} was concurrently published at ${storedPoint.price}`
    )

  await applyOraclePointToLivePerps(pg, feedId, storedPoint)
  return { success: true } as const
}
