import { PerpContract } from 'common/contract'
import {
  decideOracleTransition,
  OraclePoint,
  validateBasicOraclePoint,
} from 'common/perps/oracle'
import { notifyPerpOracleResult } from 'shared/notifications/perps'
import { runOracleUpdate } from 'shared/perps/engine'
import { getOracleFeed } from 'shared/oracle-feeds'
import {
  classifyOracleApplyFailure,
  DEFAULT_MARK_STALE_ALERT_MS,
  OracleUpdateBounds,
} from 'shared/perps/oracle-tick-bounds'
import { publishPerpQuote } from 'shared/perps/publish-perp-quote'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

/**
 * Contracts we have already paged for in their current stale episode.
 *
 * A failing apply pages exactly ONCE per episode and stays silent (WARN only)
 * thereafter, until an apply succeeds and clears the flag. So a stall spanning
 * a minute of 2s ticks is one alert, not thirty.
 *
 * The page fires when the mark goes DARK — past the feed's own staleAfterMs —
 * NOT when the market freezes at maxOraclePriceAgeMs. Those were the same
 * threshold until the BTC gate was tightened to ~10s; see
 * classifyOracleApplyFailure for why they must not be. A market that pauses for
 * a few seconds is the gate working, several times an hour, and nobody needs to
 * hear about it; a mark that has not advanced in two minutes is broken.
 *
 * This is the only staleness signal nothing else provides, since feed staleness
 * reads oracle_prices (already written by apply time) and the stuck-feed
 * detector reads inFlightSince (clear once the poll completes).
 *
 * Module-level per scheduler process; a restart may re-arm and page once more,
 * which is acceptable.
 */
const staleAlerted = new Set<string>()

/** The feed's own incident budget; see classifyOracleApplyFailure. */
const getMarkStaleAlertMs = (feedId: string) =>
  getOracleFeed(feedId)?.staleAfterMs ?? DEFAULT_MARK_STALE_ALERT_MS

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

      // The apply landed: the mark is tracking the feed again. If we paged for
      // a stall on this contract, note the recovery and re-arm the alert.
      if (staleAlerted.delete(contract.id)) {
        log.info(
          `[oracle-feeds] ${contract.slug}: executable mark recovered and tracking ${feedId} again`
        )
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
      // Dark = the mark has not advanced for the FEED's whole staleness
      // budget. Deliberately NOT maxOraclePriceAgeMs: crossing that only
      // pauses trading, which is the gate doing its job.
      const markStaleAlertMs = getMarkStaleAlertMs(feedId)
      const dark = markAge >= markStaleAlertMs

      if (
        classifyOracleApplyFailure(
          err,
          bounds != null,
          markAge,
          markStaleAlertMs
        ) === 'warn'
      ) {
        // A bounded tick yielding its slot is the design working — the next
        // tick is already due with a better price. Never pages, however many
        // ticks the stall spans, and whether or not the market paused along
        // the way.
        log.warn(message)
      } else if (staleAlerted.has(contract.id)) {
        // Already paged once for this episode. Keep a log trail at WARN, but do
        // not page again until a successful apply clears the flag above.
        log.warn(message)
      } else {
        // First real failure of this episode: page exactly once. Either the
        // mark has gone dark, or an unexpected (non-skip) error hit it — both
        // warrant a look.
        staleAlerted.add(contract.id)
        log.error(
          dark
            ? `${message} — executable mark is ${markAge}ms old, past this feed's ${markStaleAlertMs}ms staleness budget; ${contract.slug} stopped accepting trades once it passed ${contract.maxOraclePriceAgeMs}ms and stays frozen until an apply succeeds`
            : message
        )
      }
    }
  }
}
