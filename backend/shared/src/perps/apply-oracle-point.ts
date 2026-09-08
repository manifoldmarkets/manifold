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
import { publishPerpQuote } from 'shared/perps/publish-perp-quote'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  OraclePollAbandonedError,
  OraclePollProgress,
} from 'shared/oracle-feed-dispatcher'

/**
 * How far a contract's executable mark may fall behind the feed before a
 * failed apply is an incident rather than a skipped slot.
 *
 * Expressed as a fraction of the contract's own maxOraclePriceAgeMs so the
 * alert always lands BEFORE the market freezes at that threshold, whatever it
 * is set to. This is the signal nothing else provides: feed staleness reads
 * oracle_prices, which the publisher has already written by the time apply
 * runs, and the poll deadline sees a completed run. Both stay green while a
 * single contract silently stops tracking the price it executes against.
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
  bounds?: OracleUpdateBounds,
  /** Fast-poll checkpoints; other publishers finish their complete update. */
  progress?: OraclePollProgress
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
  progress?.checkpoint('apply:read-stored-point')
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

  progress?.checkpoint('apply:read-live-contracts')
  const rows = await pg.manyOrNone<{ data: PerpContract }>(
    `select data from contracts
     where mechanism = 'perp'
       and resolution_time is null
       and data->>'oracleFeedId' = $1`,
    [feedId]
  )

  // Statement/lock limits bound each engine transaction. Fast-poll
  // checkpoints also stop abandoned runs before their next read or contract.
  // Already-started transactions finish atomically and deliver their results.
  for (const { data: contract } of rows) {
    progress?.checkpoint(`apply:check-contract(${contract.slug})`)
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
      progress?.checkpoint(`apply:runOracleUpdate(${contract.slug})`)
      const result = await runOracleUpdate(
        contract.id,
        persistedPoint.price,
        persistedPoint.ts,
        persistedPoint.sourceTs,
        bounds
      )
      if (!result) continue

      // The update committed. Even if the poll's deadline passed while it
      // ran, finish its quote/notifications; stop before the next contract.
      progress?.setPhase(`apply:publishQuote(${contract.slug})`)

      if (result.solvencyHalt) {
        // The tick committed its PRICE but not its state, and halted trading.
        // Same `[oracle-feeds]` prefix as the catch below, so the existing
        // alert policy pages exactly as it did when this threw — the market is
        // no longer dark while it waits, but it still needs an operator.
        log.error(
          `[oracle-feeds] ${contract.slug}: ${feedId} @ ${persistedPoint.ts} applied as PRICE ONLY, trading halted — post-tick state is not solvent: ${result.solvencyHalt.reason}`
        )
        publishPerpQuote({
          contractId: contract.id,
          oraclePrice: persistedPoint.price,
          oraclePriceTime: persistedPoint.ts,
          poolLong: result.poolLongAfter,
          poolShort: result.poolShortAfter,
          ...(persistedPoint.sourceTs == null
            ? {}
            : { oracleSourceTime: persistedPoint.sourceTs }),
        })
        continue
      }

      // Push before notifying: notification delivery does its own DB work and
      // the whole point of this path is that open pages see the new price in
      // well under a tick. Carries only what the tick authoritatively settled
      // — price and post-tick pools. Open interest and the funding rate can
      // also move on a liquidating tick, but this scope only has the pre-tick
      // contract snapshot for them, so they stay on the polled path rather
      // than pushing a stale value over a fresh one.
      publishPerpQuote({
        contractId: contract.id,
        oraclePrice: persistedPoint.price,
        oraclePriceTime: persistedPoint.ts,
        poolLong: result.poolLongAfter,
        poolShort: result.poolShortAfter,
        ...(persistedPoint.sourceTs == null
          ? {}
          : { oracleSourceTime: persistedPoint.sourceTs }),
      })

      try {
        progress?.setPhase(`apply:notify(${contract.slug})`)
        await notifyPerpOracleResult(pg, contract, persistedPoint.price, result)
      } catch (err) {
        // The price transition is already committed. Notification delivery
        // must not prevent the remaining contracts on this feed from updating.
        log.error(
          `[oracle-feeds] ${contract.slug}: notifications failed after applying ${feedId} @ ${persistedPoint.ts}: ${err}`
        )
      }
    } catch (err) {
      if (err instanceof OraclePollAbandonedError) throw err
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
