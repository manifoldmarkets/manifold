import { PerpContract } from 'common/contract'
import {
  decideOracleTransition,
  OraclePoint,
  validateBasicOraclePoint,
} from 'common/perps/oracle'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import { runOracleUpdate } from 'shared/perps/engine'
import {
  isOracleTickTimeout,
  OracleUpdateBounds,
} from 'shared/perps/oracle-tick-bounds'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

/**
 * How far a contract's executable mark may fall behind the feed before a
 * failed apply is an incident rather than a skipped slot.
 *
 * Expressed as a fraction of the contract's own maxOraclePriceAgeMs so the
 * alert always lands BEFORE the market freezes at that threshold, whatever it
 * is set to. This is the signal nothing else provides: feed staleness reads
 * oracle_prices, which the publisher has already written by the time apply
 * runs, and the stuck-feed detector reads inFlightSince, which is clear
 * because the poll itself completed. Both stay green while a single contract
 * silently stops tracking the price it executes against.
 */
const APPLICATION_LAG_ALERT_FRACTION = 0.5

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
  point: OraclePoint,
  /**
   * Fast-tick only. Omitted by the daily publishers and the admin write path,
   * which must wait for the apply rather than abandon it — see
   * OracleUpdateBounds.
   */
  bounds?: OracleUpdateBounds
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

  // NOTE: the bounds here are per-statement and per-lock, not a deadline for
  // the whole run. Contracts are applied sequentially, and pool checkout, the
  // query above, and notifications all sit outside them, so one slow contract
  // can still hold a feed in-flight past a tick — the in-flight guard then
  // skips that firing, which is degraded but correct.
  //
  // A run-wide budget was tried and removed: it can only bind when a feed
  // backs more than one market, which none currently do, and skipping
  // contracts by wall-clock in an unordered result set starves whichever ones
  // sort last. Doing it properly needs oldest-first ordering (or rotation),
  // escalation for contracts that keep getting skipped, and a deadline
  // propagated from dispatch. That belongs with the change that first puts two
  // markets on one feed, not here.
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
        persistedPoint.sourceTs,
        bounds
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
      const message = `[oracle-feeds] ${contract.slug}: failed to apply ${feedId} @ ${persistedPoint.ts}: ${err}`
      // Wall-clock age of the mark this contract executes against, matching
      // what trading freshness actually gates on.
      // Measuring `persistedPoint.ts - oraclePriceTime` instead would freeze
      // the moment the feed stopped advancing: a contract that missed one
      // point keeps a constant delta while its cached mark ages past
      // maxOraclePriceAgeMs, so the alert would never fire on the case that
      // matters most.
      const markAge =
        contract.oraclePriceTime == null
          ? Number.POSITIVE_INFINITY
          : Date.now() - contract.oraclePriceTime
      const lagBudget =
        contract.maxOraclePriceAgeMs * APPLICATION_LAG_ALERT_FRACTION

      // A single bounded tick giving up its slot is the design working, and
      // the next tick is already due with a better price — that should not
      // page. But repeated failures walk the mark toward the freshness
      // threshold with no other alarm attached to it, so escalate on the age
      // itself rather than on the cause. Only a caller that ASKED for these
      // bounds may treat them as expected: an unbounded caller's 57014 came
      // from somewhere it did not choose, and stays an error.
      if (bounds != null && isOracleTickTimeout(err) && markAge < lagBudget) {
        log.warn(message)
      } else if (markAge >= lagBudget) {
        log.error(
          `${message} — executable mark is ${markAge}ms old, past ${lagBudget}ms of its ${contract.maxOraclePriceAgeMs}ms freshness budget; this market will stop trading if it keeps failing`
        )
      } else {
        log.error(message)
      }
    }
  }
}
