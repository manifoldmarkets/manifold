import { PerpContract } from 'common/contract'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import { runOracleUpdate } from 'shared/perps/engine'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

type OraclePoint = {
  ts: number
  price: number
}

/**
 * Apply a newly published oracle point to every live market on its feed.
 *
 * Feed writers call this immediately after persisting the point; otherwise
 * public oracle history leads the contract's executable price until the
 * top-of-hour PERP sweep. The engine remains the authority for locking,
 * ordering, liquidation, ADL, and persistence.
 */
export const applyOraclePointToLivePerps = async (
  pg: SupabaseDirectClient,
  feedId: string,
  point: OraclePoint
) => {
  if (
    !Number.isFinite(point.ts) ||
    !Number.isFinite(point.price) ||
    point.ts <= 0 ||
    point.price <= 0
  ) {
    throw new Error(
      `Refusing to apply invalid ${feedId} oracle point ${point.price} @ ${point.ts}`
    )
  }

  // The database row is the published source of truth. INSERT ... DO NOTHING
  // can lose a same-timestamp race, so never execute against the caller's value
  // until it matches the immutable row that actually won.
  const stored = await pg.oneOrNone<{
    ts: string
    price: number | string
  }>(
    `select ts, price from oracle_prices
     where feed_id = $1
       and ts = to_timestamp($2::double precision / 1000.0)`,
    [feedId, point.ts]
  )
  if (!stored)
    throw new Error(
      `Refusing to apply unpublished ${feedId} oracle point @ ${point.ts}`
    )

  const persistedPoint = {
    ts: new Date(stored.ts).getTime(),
    price: Number(stored.price),
  }
  if (persistedPoint.price !== point.price)
    throw new Error(
      `Refusing to apply conflicting ${feedId} oracle point ${point.price} @ ${point.ts}; stored price is ${persistedPoint.price}`
    )

  const rows = await pg.manyOrNone<{ data: PerpContract }>(
    `select data from contracts
     where mechanism = 'perp'
       and resolution_time is null
       and data->>'oracleFeedId' = $1`,
    [feedId]
  )

  for (const { data: contract } of rows) {
    const appliedTime = contract.oraclePriceTime ?? 0
    if (appliedTime >= persistedPoint.ts) {
      if (
        appliedTime === persistedPoint.ts &&
        contract.oraclePrice !== persistedPoint.price
      ) {
        log.error(
          `[oracle-feeds] ${
            contract.slug
          }: immutable point ${feedId} @ ${new Date(
            persistedPoint.ts
          ).toISOString()} conflicts with cached price ${
            contract.oraclePrice
          } (published ${persistedPoint.price})`
        )
      }
      continue
    }

    try {
      const result = await runOracleUpdate(
        contract.id,
        persistedPoint.price,
        persistedPoint.ts
      )
      if (!result) continue

      try {
        await notifyPerpOracleResult(pg, contract, persistedPoint.price, result)
      } catch (err) {
        // The price transition is already committed. Notification delivery
        // must not prevent the remaining contracts on this feed from updating.
        log.error(
          `[oracle-feeds] ${contract.slug}: notifications failed after applying ${feedId} @ ${persistedPoint.ts}: ${err}`
        )
      }
    } catch (err) {
      // One malformed/contended contract must not leave every other market on
      // the same feed trading against a stale cached price.
      log.error(
        `[oracle-feeds] ${contract.slug}: failed to apply ${feedId} @ ${persistedPoint.ts}: ${err}`
      )
    }
  }
}
