import { PerpContract } from 'common/contract'
import {
  getMnxTradingPauseReason,
  MNX_INSTRUMENTS,
  MNX_POLL_MS,
  MNX_CHECK_MAX_AGE_MS,
} from 'common/perps/mnx'
import { getPerpQuote } from 'common/perps/quote'
import { mapAsync } from 'common/util/promise'
import {
  fetchMnxMarkets,
  MnxSnapshot,
  mnxRetryDelay,
  parseMnxSnapshot,
} from '../mnx'
import { insertOraclePrices } from '../oracle'
import { SupabaseDirectClient } from '../supabase/init'
import { log } from '../utils'
import { applyOraclePointToLivePerps } from './apply-oracle-point'
import { advisoryLockQuery, mergeContractDataQuery } from './queries'
import { publishPerpQuote } from './publish-perp-quote'
import {
  FAST_TICK_ORACLE_BOUNDS,
  FAST_TICK_TX_TAG,
  oracleTickTimeoutsQuery,
} from './oracle-tick-bounds'

export const readMnxSnapshot = async (pg: SupabaseDirectClient) => {
  const row = await pg.oneOrNone<{ snapshot: MnxSnapshot | null }>(
    `select snapshot from mnx_provider_state where id = 'markets'`
  )
  return row?.snapshot ?? null
}

/** Also used by creation/preflight: candles or merely successful HTTP fetches
 * cannot make a feed executable. */
export const requireMnxReady = (
  snapshot: MnxSnapshot | null,
  feedId: string,
  now = Date.now()
) => {
  const feed = snapshot?.feeds[feedId]
  if (
    !feed?.point ||
    feed.point.sourceData?.kind !== 'live' ||
    !feed.maxLeverage
  )
    throw new Error('MNX has no validated live observation')
  const reason = getMnxTradingPauseReason(
    {
      oracleFeedId: feedId,
      oracleFeedHealth: feed.health,
      oraclePrice: feed.point.price,
      oraclePriceTime: feed.point.ts,
    },
    now
  )
  if (reason) throw new Error(reason)
  return feed
}

export const collectMnxSnapshot = async (
  pg: SupabaseDirectClient,
  fetchMarkets: () => Promise<unknown> = fetchMnxMarkets
) =>
  pg.tx(async (tx) => {
    // The lock spans the bounded HTTP request and atomic publication. Unlike an
    // expiring lease it cannot be stolen from a worker still committing data.
    const { locked } = await tx.one<{ locked: boolean }>(
      `select pg_try_advisory_xact_lock(hashtext('mnx:markets')) as locked`
    )
    if (!locked) return null
    const state = await tx.one<{
      snapshot: MnxSnapshot | null
      failures: number
      due: boolean
    }>(
      `select snapshot, failures, next_attempt_at <= now() as due
     from mnx_provider_state where id = 'markets' for update`
    )
    if (!state.due) return null
    let snapshot: MnxSnapshot
    try {
      const payload = await fetchMarkets()
      snapshot = parseMnxSnapshot(payload, Date.now(), state.snapshot)
    } catch (error) {
      const now = Date.now()
      const failures = state.failures + 1
      await tx.none(
        `update mnx_provider_state set failures = $1, last_error = $2,
      next_attempt_at = $3 where id = 'markets'`,
        [
          failures,
          String(error),
          new Date(now + mnxRetryDelay(error, failures, now)).toISOString(),
        ]
      )
      log.error(`[oracle-feeds] MNX collection failed: ${error}`)
      return null
    }
    for (const spec of MNX_INSTRUMENTS) {
      const feed = snapshot.feeds[spec.feedId]
      if (feed.health.status !== 'available' || !feed.point) continue
      const previous = await tx.oneOrNone<{
        ts: string
        price: number | string
        source_data: { kind?: string; markPriceRaw?: string } | null
      }>(
        `select ts, price, source_data from oracle_prices where feed_id = $1 order by ts desc limit 1`,
        [spec.feedId]
      )
      if (
        previous &&
        (Date.parse(previous.ts) > feed.point.ts ||
          (Date.parse(previous.ts) === feed.point.ts &&
            (Number(previous.price) !== feed.point.price ||
              previous.source_data?.kind !== 'live' ||
              previous.source_data?.markPriceRaw !==
                feed.point.sourceData?.markPriceRaw)))
      ) {
        feed.health = {
          checkedAt: snapshot.fetchedAt,
          status: 'unavailable',
          reason: 'MNX observation conflicts with published history',
        }
        continue
      }
      await insertOraclePrices(tx, spec.feedId, [feed.point])
    }
    await tx.none(
      `update mnx_provider_state set snapshot = $1, failures = 0,
    last_error = null, next_attempt_at = $2 where id = 'markets'`,
      [
        snapshot,
        // Target the next cron slot, not fetch-completion + 60s (which would
        // skip every other minute whenever HTTP takes nonzero time).
        new Date(
          (Math.floor(snapshot.fetchedAt / MNX_POLL_MS) + 1) * MNX_POLL_MS
        ).toISOString(),
      ]
    )
    return snapshot
  })

export const applyMnxSnapshot = async (
  pg: SupabaseDirectClient,
  snapshot: MnxSnapshot
) => {
  // Independent feeds can advance while another waits on a busy contract.
  // Bound both health and price transactions; the next minute retries the
  // durable snapshot, so contention must not keep the cron run alive forever.
  await mapAsync(
    MNX_INSTRUMENTS,
    async (spec) => {
      const feed = snapshot.feeds[spec.feedId]
      try {
        const contracts = await pg.manyOrNone<{ id: string }>(
          `select id from contracts where mechanism = 'perp' and resolution_time is null
         and data->>'oracleFeedId' = $1`,
          [spec.feedId]
        )
        for (const { id } of contracts) {
          const quote = await pg.tx({ tag: FAST_TICK_TX_TAG }, async (tx) => {
            await tx.none(
              oracleTickTimeoutsQuery(
                FAST_TICK_ORACLE_BOUNDS.lockTimeoutMs,
                FAST_TICK_ORACLE_BOUNDS.statementTimeoutMs
              )
            )
            await tx.one(advisoryLockQuery(id))
            const row = await tx.one<{ data: PerpContract }>(
              `select data from contracts where id = $1 for update`,
              [id]
            )
            const contract = row.data
            if (
              contract.isResolved ||
              (contract.oracleFeedHealth?.checkedAt ?? 0) >=
                feed.health.checkedAt
            )
              return null
            await tx.one(
              mergeContractDataQuery(id, { oracleFeedHealth: feed.health })
            )
            // Publish health BEFORE applying the price. If apply fails, the
            // shared gate sees priceTime/price mismatch and refuses trades.
            return getPerpQuote({ ...contract, oracleFeedHealth: feed.health })
          })
          if (quote) publishPerpQuote(quote)
        }
        if (feed.health.status === 'available' && feed.point) {
          await applyOraclePointToLivePerps(
            pg,
            spec.feedId,
            feed.point,
            FAST_TICK_ORACLE_BOUNDS
          )
        } else {
          log.error(`[oracle-feeds] ${spec.feedId}: ${feed.health.reason}`)
        }
      } catch (error) {
        log.error(
          `[oracle-feeds] ${spec.feedId}: MNX application failed: ${error}`
        )
      }
    },
    4
  )
}

export const publishMnx = async (pg: SupabaseDirectClient) => {
  const collected = await collectMnxSnapshot(pg)
  // Reapply durable data after a crash/partial application, including during
  // backoff. Reapplying does not change checkedAt or source timestamps.
  const snapshot = collected ?? (await readMnxSnapshot(pg))
  if (snapshot) {
    if (Date.now() - snapshot.fetchedAt > MNX_CHECK_MAX_AGE_MS)
      log.error(
        '[oracle-feeds] MNX successful provider checks are over five minutes old'
      )
    await applyMnxSnapshot(pg, snapshot)
  }
}
