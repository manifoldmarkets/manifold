import { PerpContract } from 'common/contract'
import { OraclePoint } from 'common/perps/oracle'
import { OracleFeedHealth } from 'common/perps/oracle-health'
import { getPerpQuote } from 'common/perps/quote'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import { insertOraclePrices } from '../oracle'
import { OracleFeedDef, validateOraclePoint } from '../oracle-feeds'
import { SupabaseDirectClient } from '../supabase/init'
import { log } from '../utils'
import { applyOraclePointToLivePerps } from './apply-oracle-point'
import { advisoryLockQuery, mergeContractDataQuery } from './queries'
import { publishPerpQuote } from './publish-perp-quote'
import {
  FAST_TICK_TX_TAG,
  isOracleTickTimeout,
  oracleTickTimeoutsQuery,
  OracleUpdateBounds,
} from './oracle-tick-bounds'

class InvalidOracleObservation extends Error {}

const failures = new Map<
  string,
  { since: number; warnedAt: number; pagedAt?: number }
>()
/** One warning per minute and one stale-provider page per hour per feed.
 * Error text changing on every request cannot defeat the throttle. */
export const reportOracleObservationFailure = (
  feedId: string,
  reason: string,
  now = Date.now()
) => {
  const state = failures.get(feedId) ?? { since: now, warnedAt: -Infinity }
  failures.set(feedId, state)
  if (
    now - state.since >= 5 * MINUTE_MS &&
    now - (state.pagedAt ?? -Infinity) >= HOUR_MS
  ) {
    state.pagedAt = now
    log.error(
      `[oracle-feeds] ${feedId}: unavailable for over five minutes — ${reason}`
    )
  } else if (now - state.warnedAt >= MINUTE_MS) {
    state.warnedAt = now
    log.warn(`[oracle-feeds] ${feedId}: ${reason}`)
  }
}

/** Withdraw availability without touching the last executable price. Each
 * contract owns its transaction so a contended market cannot block siblings. */
export const applyOracleFeedUnavailability = async (
  pg: SupabaseDirectClient,
  feedId: string,
  health: OracleFeedHealth,
  bounds?: OracleUpdateBounds
) => {
  if (health.status !== 'unavailable')
    throw new Error('Available health requires an atomic price update')
  const rows = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where mechanism = 'perp' and resolution_time is null and data->>'oracleFeedId' = $1`,
    [feedId]
  )
  for (const { id } of rows) {
    try {
      const quote = await pg.tx(
        bounds ? { tag: FAST_TICK_TX_TAG } : {},
        async (tx) => {
          if (bounds)
            await tx.none(
              oracleTickTimeoutsQuery(
                bounds.lockTimeoutMs,
                bounds.statementTimeoutMs
              )
            )
          await tx.one(advisoryLockQuery(id))
          const { data: contract } = await tx.one<{ data: PerpContract }>(
            `select data from contracts where id = $1 for update`,
            [id]
          )
          if (
            contract.isResolved ||
            contract.oracleFeedId !== feedId ||
            (contract.oracleFeedHealth?.checkedAt ?? 0) >= health.checkedAt
          )
            return null
          await tx.one(mergeContractDataQuery(id, { oracleFeedHealth: health }))
          return getPerpQuote({ ...contract, oracleFeedHealth: health })
        }
      )
      if (quote) publishPerpQuote(quote)
    } catch (error) {
      if (bounds && isOracleTickTimeout(error))
        log.warn(`[oracle-feeds] ${id}: health tick skipped — ${error}`)
      else
        reportOracleObservationFailure(
          feedId,
          `health application failed: ${error}`
        )
    }
  }
}

export const publishOracleObservation = async (
  pg: SupabaseDirectClient,
  feed: OracleFeedDef,
  observation: { point?: OraclePoint; health: OracleFeedHealth },
  bounds?: OracleUpdateBounds
) => {
  const { point, health } = observation
  if (health.status === 'unavailable' || !point) {
    reportOracleObservationFailure(
      feed.id,
      health.reason ?? 'Missing provider point'
    )
    await applyOracleFeedUnavailability(
      pg,
      feed.id,
      { ...health, status: 'unavailable' },
      bounds
    )
    return
  }
  // Fetch has already completed. Serialize decide-and-write with every other
  // publisher/backfill of this feed, using the established per-feed lock.
  const latest = await pg
    .tx(bounds ? { tag: FAST_TICK_TX_TAG } : {}, async (tx) => {
      if (bounds)
        await tx.none(
          oracleTickTimeoutsQuery(
            bounds.lockTimeoutMs,
            bounds.statementTimeoutMs
          )
        )
      await tx.one(advisoryLockQuery(`oracle-publish:${feed.id}`))
      const row = await tx.oneOrNone<{
        ts: string
        price: number | string
        source_ts: string | null
      }>(
        `select ts, price, source_ts from oracle_prices where feed_id = $1 order by ts desc limit 1`,
        [feed.id]
      )
      const previous: OraclePoint | null = row
        ? {
            ts: Date.parse(row.ts),
            price: Number(row.price),
            ...(row.source_ts ? { sourceTs: Date.parse(row.source_ts) } : {}),
          }
        : null
      // Another process may have published a more recent observation already.
      if (previous && point.ts < previous.ts) return null
      if (previous && point.ts === previous.ts) {
        if (
          point.price !== previous.price ||
          point.sourceTs !== previous.sourceTs
        )
          throw new InvalidOracleObservation(
            'Conflicting immutable provider observation'
          )
        return previous
      }
      const rejection = validateOraclePoint(feed, previous, point)
      if (rejection) throw new InvalidOracleObservation(rejection)
      if (
        previous?.sourceTs != null &&
        point.sourceTs != null &&
        (point.sourceTs < previous.sourceTs ||
          (point.sourceTs === previous.sourceTs &&
            point.price !== previous.price))
      )
        throw new InvalidOracleObservation(
          'Provider source timestamp regressed or conflicts with published history'
        )
      // Price changes and flat-price heartbeats follow the normal fast-tick rule.
      if (
        previous &&
        point.price === previous.price &&
        point.ts - previous.ts < feed.staleAfterMs / 2
      )
        return previous
      await insertOraclePrices(tx, feed.id, [point])
      return point
    })
    .catch(async (error) => {
      if (!(error instanceof InvalidOracleObservation)) throw error
      reportOracleObservationFailure(feed.id, error.message)
      await applyOracleFeedUnavailability(
        pg,
        feed.id,
        {
          checkedAt: health.checkedAt,
          status: 'unavailable',
          reason: error.message,
        },
        bounds
      )
      return null
    })
  if (!latest) return
  failures.delete(feed.id)
  // Both fields are committed by runOracleUpdate under the contract lock.
  await applyOraclePointToLivePerps(pg, feed.id, latest, bounds, health)
}
