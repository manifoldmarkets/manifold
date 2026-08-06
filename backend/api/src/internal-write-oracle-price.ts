import { OraclePoint } from 'common/perps/oracle'
import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

type StoredOraclePoint = {
  ts: string
  price: number | string
  source_ts: string | null
}

const toOraclePoint = (row: StoredOraclePoint): OraclePoint => {
  const sourceTs =
    row.source_ts == null ? undefined : new Date(row.source_ts).getTime()
  return {
    ts: new Date(row.ts).getTime(),
    price: Number(row.price),
    ...(sourceTs == null ? {} : { sourceTs }),
  }
}

// Append and immediately apply one oracle observation. This remains
// admin-gated, but it follows the same registry, bounds, jump, timestamp, and
// immutability rules as automated feed writers.
export const internalWriteOraclePrice: APIHandler<
  'internal-write-oracle-price'
> = async (body, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  const { feedId, ts, price, sourceTs } = body
  const pg = createSupabaseDirectClient()
  const point = { ts, price }

  const feed = getOracleFeed(feedId)
  if (!feed) throw new APIError(400, `Unknown oracle feed "${feedId}"`)
  if (getOracleAttribution(feedId)?.showAsOf && sourceTs == null)
    throw new APIError(
      400,
      `Oracle feed "${feedId}" requires a provider source timestamp for attribution`
    )
  const pointWithSource = { ...point, sourceTs }

  const existing = await pg.oneOrNone<StoredOraclePoint>(
    `select ts, price, source_ts from oracle_prices
     where feed_id = $1
       and ts = to_timestamp($2::double precision / 1000.0)`,
    [feedId, ts]
  )
  if (existing) {
    const existingPoint = toOraclePoint(existing)
    if (existingPoint.price !== price)
      throw new APIError(
        409,
        `Oracle point ${feedId} @ ${ts} is immutable at ${existingPoint.price}`
      )
    if (sourceTs != null && existingPoint.sourceTs !== sourceTs)
      throw new APIError(
        409,
        `Oracle point ${feedId} @ ${ts} has immutable source timestamp ${
          existingPoint.sourceTs ?? 'missing'
        }`
      )
    await applyOraclePointToLivePerps(pg, feedId, existingPoint)
    return { success: true } as const
  }

  const latest = await pg.oneOrNone<StoredOraclePoint>(
    `select ts, price, source_ts from oracle_prices
     where feed_id = $1
     order by ts desc
     limit 1`,
    [feedId]
  )
  const rejection = validateOraclePoint(
    feed,
    latest ? toOraclePoint(latest) : null,
    pointWithSource
  )
  if (rejection) throw new APIError(400, rejection)

  await insertOraclePrices(pg, feedId, [pointWithSource])

  // Read after INSERT ... ON CONFLICT DO NOTHING to close the concurrent
  // writer race. Never apply the caller's value unless that exact value is the
  // immutable row that won.
  const stored = await pg.one<StoredOraclePoint>(
    `select ts, price, source_ts from oracle_prices
     where feed_id = $1
       and ts = to_timestamp($2::double precision / 1000.0)`,
    [feedId, ts]
  )
  const storedPoint = toOraclePoint(stored)
  if (
    storedPoint.price !== price ||
    (sourceTs != null && storedPoint.sourceTs !== sourceTs)
  )
    throw new APIError(
      409,
      `Oracle point ${feedId} @ ${ts} was concurrently published at ${
        storedPoint.price
      } with source timestamp ${storedPoint.sourceTs ?? 'missing'}`
    )

  await applyOraclePointToLivePerps(pg, feedId, storedPoint)
  return { success: true } as const
}
