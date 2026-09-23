import { decideDailyFeedPublish } from 'common/perps/daily-feed-publish'
import { FEAR_GREED_MAX_SOURCE_AGE_MS } from 'common/perps/fear-greed'
import { utcDateString } from 'common/perps/open-weight-models'

import { fetchFearGreedLatest } from 'shared/fear-greed'
import { CRYPTO_FEAR_GREED_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'
import { advisoryLockQuery } from 'shared/perps/queries'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Publisher for the `crypto-fear-greed` feed. Structurally the VoteHub
// publisher (publish-votehub-average.ts) with the canary removed — the
// provider publishes a single integer, there is no second series to
// corroborate it against, and the source-staleness check plus the registry
// bounds are the whole validation. The sequence is the same one every slow
// feed in this folder follows: fetch → observe → early-out → advisory lock →
// re-decide → validateOraclePoint → insertOraclePrices →
// applyOraclePointToLivePerps outside the transaction.

/** Today's UTC calendar day, for log lines and failure reports. */
export const fearGreedDay = (now: number = Date.now()) => utcDateString(now)

export type FearGreedPublishResult =
  | {
      status: 'published'
      price: number
      ts: number
      /** The provider's own timestamp for the reading. */
      sourceTs: number
      classification: string | null
    }
  | { status: 'unchanged'; price: number; reason: string }
  | { status: 'rejected'; reason: string }

/**
 * Publish ONE observation of the current Fear & Greed reading, stamped when
 * it became available to the market (`Date.now()` at fetch), with the
 * provider's own timestamp carried as `sourceTs`. Never stamped at the day
 * boundary: a live job that backdated a reading to 00:00 UTC would be
 * writing it into a window where funding and liquidations have already run.
 *
 * Every unsuccessful outcome is REPORTED, never logged here — only the
 * caller knows whether another attempt is coming.
 */
export const publishFearGreedPoint = async (
  pg: SupabaseDirectClient,
  options: { force?: boolean } = {}
): Promise<FearGreedPublishResult> => {
  const feedId = CRYPTO_FEAR_GREED_FEED_ID
  const latest = await fetchFearGreedLatest()
  // Stamp the observation the moment it arrives: the point is when we saw
  // the value, and under the lock below validateOraclePoint uses this stamp
  // to stop a stalled publisher rolling the mark back onto an older reading.
  const observedAt = Date.now()

  // A source that stops updating must stop the feed, not be relaid every
  // heartbeat under a fresh timestamp.
  if (observedAt - latest.sourceTs > FEAR_GREED_MAX_SOURCE_AGE_MS)
    return {
      status: 'rejected',
      reason: `provider reading is stale: stamped ${new Date(
        latest.sourceTs
      ).toISOString()}, more than ${
        FEAR_GREED_MAX_SOURCE_AGE_MS / 3_600_000
      }h ago`,
    }

  const readLast = async (
    db: SupabaseDirectClient
  ): Promise<{ ts: number; price: number; sourceTs: number | null } | null> => {
    const row = await db.oneOrNone<{
      ts: string
      price: number | string
      source_ts: string | null
    }>(
      `select ts, price, source_ts from oracle_prices where feed_id = $1
       order by ts desc limit 1`,
      [feedId]
    )
    if (!row) return null
    const lastSourceTs =
      row.source_ts == null ? null : new Date(row.source_ts).getTime()
    return {
      ts: new Date(row.ts).getTime(),
      price: Number(row.price),
      sourceTs: Number.isFinite(lastSourceTs) ? lastSourceTs : null,
    }
  }

  // `force` is the operator escape hatch, as on the VoteHub feeds: stamp the
  // current value regardless of the unchanged gate during an incident.
  const decide = (last: { ts: number; price: number } | null) =>
    options.force
      ? ({ publish: true, reason: 'forced' } as const)
      : decideDailyFeedPublish({ price: latest.value, last, now: observedAt })

  // Cheap early-out OUTSIDE the lock. Unchanged is the overwhelming common
  // case at a 5-minute cadence against a once-a-day source. The authoritative
  // re-check happens under the lock; this one is an optimisation and may race.
  const earlyDecision = decide(await readLast(pg))
  if (!earlyDecision.publish)
    return {
      status: 'unchanged',
      price: latest.value,
      reason: earlyDecision.reason,
    }

  const point = {
    ts: observedAt,
    price: latest.value,
    sourceTs: latest.sourceTs,
  }
  const feed = getOracleFeed(feedId)
  if (!feed)
    return { status: 'rejected', reason: `missing OracleFeedDef for ${feedId}` }

  // Serialize decide-and-write against every other publisher on this feed
  // (the manual script, a second scheduler instance mid-deploy). The decision
  // is re-made INSIDE the lock against a fresh read.
  const outcome = await pg.tx(async (tx) => {
    await tx.one(advisoryLockQuery(`oracle-publish:${feedId}`))
    const last = await readLast(tx)

    const decision = decide(last)
    if (!decision.publish)
      return {
        status: 'unchanged' as const,
        price: latest.value,
        reason: decision.reason,
      }

    // Never publish a reading the provider stamped EARLIER than the one
    // already on the feed. A stale cached response (an older reading, still
    // inside the 3-day source-age allowance, with a different value) would
    // otherwise be applied as a fresh move. Equal provider stamps are the
    // same reading (heartbeats, corrections); older fails closed.
    if (last?.sourceTs != null && point.sourceTs < last.sourceTs)
      return {
        status: 'rejected' as const,
        reason:
          `provider reading stamped ${new Date(
            point.sourceTs
          ).toISOString()} is older than the one already published ` +
          `(${new Date(last.sourceTs).toISOString()}); not rolling the mark ` +
          `back to an earlier reading`,
      }

    // Bounds are [1, 100]: a literal 0 print is refused here (and by
    // validateBasicOraclePoint's positivity rule) and the feed pauses at the
    // stale gate rather than publishing a non-positive price. See the
    // registry entry and common/perps/fear-greed.ts.
    const rejection = validateOraclePoint(feed, last, point)
    if (rejection)
      return {
        status: 'rejected' as const,
        reason: `reading ${point.price} but ${rejection}`,
      }

    log(
      `[fear-greed] publishing ${point.price}${
        latest.classification ? ` (${latest.classification})` : ''
      } (${decision.reason}; source ${new Date(
        point.sourceTs
      ).toISOString()}) at ${new Date(point.ts).toISOString()}`
    )
    await insertOraclePrices(tx, feedId, [point])
    return { status: 'published' as const }
  })

  if (outcome.status !== 'published') return outcome

  // Applied OUTSIDE the publishing transaction, exactly as the fast oracle
  // path does it: runOracleUpdate takes its own per-contract advisory lock,
  // and nesting that inside this one would hold both across engine work.
  await applyOraclePointToLivePerps(pg, feedId, point)
  log(`inserted 1 ${feedId} oracle point for ${fearGreedDay(observedAt)}`)
  return {
    status: 'published',
    price: point.price,
    ts: point.ts,
    sourceTs: point.sourceTs,
    classification: latest.classification,
  }
}
