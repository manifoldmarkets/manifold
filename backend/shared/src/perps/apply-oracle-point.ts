import { PerpContract } from 'common/contract'
import {
  decideOracleTransition,
  OraclePoint,
  validateBasicOraclePoint,
} from 'common/perps/oracle'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import { runOracleUpdate } from 'shared/perps/engine'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

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
  const pointRejection = validateBasicOraclePoint(point)
  if (pointRejection) {
    throw new Error(
      `Refusing to apply invalid ${feedId} oracle point: ${pointRejection}`
    )
  }

  // The database row is the published source of truth. INSERT ... DO NOTHING
  // can lose a same-timestamp race, so never execute against the caller's value
  // until it matches the immutable row that actually won.
  const stored = await pg.oneOrNone<{
    ts: string
    price: number | string
    source_ts: string | null
  }>(
    `select ts, price, source_ts from oracle_prices
     where feed_id = $1
       and ts = to_timestamp($2::double precision / 1000.0)`,
    [feedId, point.ts]
  )
  if (!stored)
    throw new Error(
      `Refusing to apply unpublished ${feedId} oracle point @ ${point.ts}`
    )

  const persistedSourceTs =
    stored.source_ts == null ? undefined : new Date(stored.source_ts).getTime()
  const persistedPoint: OraclePoint = {
    ts: new Date(stored.ts).getTime(),
    price: Number(stored.price),
    ...(persistedSourceTs == null ? {} : { sourceTs: persistedSourceTs }),
  }
  const persistedRejection = validateBasicOraclePoint(persistedPoint)
  if (persistedRejection)
    throw new Error(
      `Refusing to apply invalid stored ${feedId} oracle point: ${persistedRejection}`
    )
  if (
    persistedPoint.price !== point.price ||
    (point.sourceTs != null && persistedPoint.sourceTs !== point.sourceTs)
  )
    throw new Error(
      `Refusing to apply conflicting ${feedId} oracle point ${point.price} @ ${
        point.ts
      }; stored point is ${persistedPoint.price} with source timestamp ${
        persistedPoint.sourceTs ?? 'missing'
      }`
    )

  const rows = await pg.manyOrNone<{ data: PerpContract }>(
    `select data from contracts
     where mechanism = 'perp'
       and resolution_time is null
       and data->>'oracleFeedId' = $1`,
    [feedId]
  )

  for (const { data: contract } of rows) {
    const currentPoint =
      contract.oraclePriceTime == null
        ? null
        : {
            ts: contract.oraclePriceTime,
            price: contract.oraclePrice,
            ...(contract.oracleSourceTime == null
              ? {}
              : { sourceTs: contract.oracleSourceTime }),
          }
    const decision = decideOracleTransition(currentPoint, persistedPoint)
    if (decision.action === 'ignore') continue
    if (decision.action === 'reject') {
      log.error(
        `[oracle-feeds] ${
          contract.slug
        }: immutable point ${feedId} @ ${new Date(
          persistedPoint.ts
        ).toISOString()} conflicts with its cached oracle (${decision.reason})`
      )
      continue
    }

    try {
      const result = await runOracleUpdate(
        contract.id,
        persistedPoint.price,
        persistedPoint.ts,
        persistedPoint.sourceTs
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
