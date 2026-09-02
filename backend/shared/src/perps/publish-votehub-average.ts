import * as dayjs from 'dayjs'
import * as timezone from 'dayjs/plugin/timezone'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
dayjs.extend(timezone)

import { decideDailyFeedPublish } from 'common/perps/daily-feed-publish'
import {
  computePollAveragePoint,
  getCrossCheckGap,
  readPublishedAverage,
} from 'common/perps/votehub-average'

import { insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'
import { advisoryLockQuery } from 'shared/perps/queries'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  VoteHubFeedSpec,
  fetchVoteHubAverage,
  fetchVoteHubPolls,
  toVoteHubPolls,
} from 'shared/votehub-feeds'

// Publisher for every VoteHub published-average feed. `publishTrumpApprovalPoint`
// is this function with TRUMP_APPROVAL_SPEC; the generic ballot and Vance
// favorability feeds use it through update-votehub-averages. One structure,
// three feeds — the sequence below (fetch → observe → early-out → canary →
// advisory lock → re-decide → validateOraclePoint → insertOraclePrices →
// applyOraclePointToLivePerps outside the transaction) is the one every
// slow-feed publisher in this folder follows, and the Fear & Greed publisher
// copies it rather than inventing another.

/**
 * How far back to fetch polls for the canary.
 *
 * Enough to cover the WIDEST window the methodology can ask for, not just the
 * nominal window: when polling goes quiet the window extends to satisfy
 * `minPolls`, and a lookback that stopped at the nominal width would starve
 * exactly the case the floor exists to handle. The extra 21 days is buffer for
 * long fielding periods (some polls span 2+ weeks, so their end_date can trail
 * their start_date well past the bound).
 *
 * ...and reach back from the OLDEST day we might value, not from today: the
 * published value can be up to `maxSourceAgeDays` behind, and the cross-check
 * is computed for that day. Measuring the lookback from today silently
 * delivered a window three days short of what these comments claim.
 */
export const voteHubFetchLookbackDays = (spec: VoteHubFeedSpec) =>
  spec.rules.maxWindowDays + spec.rules.maxSourceAgeDays + 21

/** Today's calendar day in the spec's timezone (Pacific). */
export const voteHubDay = (spec: VoteHubFeedSpec, now: number = Date.now()) =>
  dayjs.tz(dayjs(now), spec.tz).format('YYYY-MM-DD')

export type VoteHubPublishResult =
  | {
      status: 'published'
      price: number
      ts: number
      /** The day VoteHub stamped the value we published, and how far behind
       * `today` that is. Surfaced so a published point can be reconciled
       * against their site without re-deriving it. */
      asOfDay: string
      ageDays: number
      /** Distance from our independent computation, or null when we could not
       * produce one. Null is "unchecked", never "agrees". */
      crossCheckGap: number | null
    }
  | { status: 'unchanged'; price: number; reason: string }
  | { status: 'no-polls'; reason: string }
  | { status: 'rejected'; reason: string }

/**
 * Publish ONE observation of VoteHub's current average for `spec`, stamped
 * when it becomes available to the market. Corrections append another
 * observation instead of pretending the revised value was tradable from
 * midnight or rewriting a point that liquidations/funding may already have
 * consumed.
 *
 * Every unsuccessful outcome is REPORTED, never logged here: a thrown fetch
 * error and a returned `no-polls` are the same kind of event to a caller
 * that retries, and only the caller knows whether another attempt is coming.
 * Logging failures at this level is what made an hourly retry loop page
 * hourly for a single outage.
 */
export const publishVoteHubPoint = async (
  pg: SupabaseDirectClient,
  spec: VoteHubFeedSpec,
  options: { force?: boolean } = {}
): Promise<VoteHubPublishResult> => {
  const { feedId, rules } = spec
  const today = voteHubDay(spec)

  // The price. Fetched first so a failure here costs one request, not two.
  const averages = await fetchVoteHubAverage(spec)
  // Stamp the observation the moment it arrives, NOT after the cross-check
  // below. With the timestamp taken later, a publisher that stalled in the
  // canary fetch could write its stale reading with a timestamp newer than a
  // concurrent publisher's fresher one, and the older observation would
  // become the executable mark. The point is when we saw the value.
  const observedAt = Date.now()
  const published = readPublishedAverage(averages, today, {
    answerKey: spec.answerKey,
    maxAgeDays: rules.maxSourceAgeDays,
  })
  if (!published.ok) return { status: 'no-polls', reason: published.reason }

  const fetchStart = dayjs
    .utc(published.asOfDay)
    .subtract(voteHubFetchLookbackDays(spec), 'day')
    .format('YYYY-MM-DD')

  const readLast = async (
    db: SupabaseDirectClient
  ): Promise<{ ts: number; price: number } | null> => {
    const row = await db.oneOrNone<{ ts: string; price: number | string }>(
      `select ts, price from oracle_prices where feed_id = $1
       order by ts desc limit 1`,
      [feedId]
    )
    if (!row) return null
    return { ts: new Date(row.ts).getTime(), price: Number(row.price) }
  }

  // `force` is the operator escape hatch: during an incident the point of
  // running this by hand is to put a fresh stamp on the feed before it
  // crosses maxOraclePriceAgeMs and pauses the engine, which is exactly the
  // case the unchanged-value gate would otherwise refuse.
  const decide = (last: { ts: number; price: number } | null) =>
    options.force
      ? ({ publish: true, reason: 'forced' } as const)
      : decideDailyFeedPublish({
          price: published.price,
          last,
          now: observedAt,
          heartbeatMs: rules.heartbeatMs,
        })

  // Cheap early-out OUTSIDE the lock. An unchanged reading is the overwhelming
  // common case at a 5-minute cadence — the value moves about once a day — and
  // concluding that costs one indexed read rather than a second HTTP request,
  // a full window computation, and a lock. The authoritative re-check happens
  // under the lock below; this one is only an optimisation and is allowed to
  // race.
  const earlyDecision = decide(await readLast(pg))
  if (!earlyDecision.publish)
    return {
      status: 'unchanged',
      price: published.price,
      reason: earlyDecision.reason,
    }

  // The canary. Computed from the raw polls, never used as the price.
  //
  // Its whole contract is that failing to produce it must not withhold a good
  // published value, so the fetch and the computation are both inside the
  // try: a timeout or an HTTP error here previously threw straight past the
  // "unchecked" path and blocked publication, which is the opposite of what
  // the surrounding comments promised.
  //
  // Computed for `published.asOfDay`, NOT for today. The published value can
  // be a day or two behind, and comparing it against a reference built from
  // polls it had not seen manufactures a divergence out of nothing but the
  // date mismatch. Residual: a poll whose end_date precedes asOfDay but which
  // VoteHub ingested afterwards still lands in our reference and not in
  // theirs. Filtering on the provider's `created_at` would be a guess at when
  // they folded it in rather than a fact. The drift it leaves is small — the
  // Trump computation moves ~0.17/day on average against a tolerance of 3 —
  // though that is a mean and not a bound, so an unusually eventful few days
  // could narrow the margin.
  let reference: ReturnType<typeof computePollAveragePoint> | null = null
  try {
    const polls = await fetchVoteHubPolls(spec, fetchStart)
    reference = computePollAveragePoint(
      toVoteHubPolls(spec, polls),
      published.asOfDay,
      rules
    )
  } catch (err) {
    reference = null
    log.warn(
      `${spec.logPrefix} cross-check reference unavailable for ${feedId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    )
  }
  const referencePrice = reference?.ok === true ? reference.price : null
  const referenceLabel =
    referencePrice == null ? '?' : referencePrice.toFixed(2)
  const crossCheckGap =
    referencePrice == null
      ? null
      : getCrossCheckGap(published.price, referencePrice)

  if (crossCheckGap == null)
    log.warn(
      `${spec.logPrefix} publishing ${feedId} ${published.price.toFixed(
        2
      )} unchecked — no independent reference (${
        reference == null
          ? 'fetch failed'
          : reference.ok
          ? 'gap not computable'
          : reference.reason
      })`
    )
  else if (crossCheckGap > rules.maxCrossCheckGap)
    return {
      status: 'rejected',
      reason:
        `published average ${published.price.toFixed(2)} (as of ` +
        `${published.asOfDay}) is ${crossCheckGap.toFixed(2)} from our own ` +
        `${referenceLabel}, over the ` +
        `${rules.maxCrossCheckGap} tolerance — not publishing a ` +
        `value two independent computations disagree about`,
    }

  const point = { price: published.price, ts: observedAt }
  const feed = getOracleFeed(feedId)
  if (!feed)
    return {
      status: 'rejected',
      reason: `missing OracleFeedDef for ${feedId}`,
    }

  // Serialize the decide-and-write against every other publisher on this
  // feed. Croner's `protect` only covers one Cron object inside one process,
  // so it does nothing about the standalone publish script, a second
  // scheduler instance during a rolling deploy, or a manual run. Without this
  // the read of the previous point and the insert are two unrelated
  // statements, and two publishers can both decide to write.
  //
  // The decision is re-made INSIDE the lock against a fresh read, because the
  // early-out above ran before the cross-check's HTTP call and its answer may
  // be seconds stale by now.
  const outcome = await pg.tx(async (tx) => {
    await tx.one(advisoryLockQuery(`oracle-publish:${feedId}`))
    const last = await readLast(tx)

    const decision = decide(last)
    if (!decision.publish)
      return {
        status: 'unchanged' as const,
        price: published.price,
        reason: decision.reason,
      }

    // validateOraclePoint rejects `point.ts <= prev.ts`, which under the lock
    // is what stops a stalled publisher from rolling the mark backwards onto
    // an older observation.
    const rejection = validateOraclePoint(feed, last, point)
    if (rejection)
      return {
        status: 'rejected' as const,
        reason: `published average ${point.price.toFixed(2)} but ${rejection}`,
      }

    log(
      `VoteHub published ${spec.label} average: ${point.price.toFixed(2)} ` +
        `(as of ${published.asOfDay}, ${published.ageDays}d old, ` +
        `${decision.reason}); ` +
        `${
          crossCheckGap == null
            ? 'cross-check unavailable'
            : `cross-check gap ${crossCheckGap.toFixed(
                2
              )} vs our own ${referenceLabel}`
        } at ${new Date(point.ts).toISOString()}`
    )
    await insertOraclePrices(tx, feedId, [point])
    return { status: 'published' as const }
  })

  if (outcome.status !== 'published') return outcome

  // Applied OUTSIDE the publishing transaction, exactly as the fast oracle
  // path does it: runOracleUpdate takes its own per-contract advisory lock,
  // and nesting that inside this one would hold both across engine work.
  await applyOraclePointToLivePerps(pg, feedId, point)
  log(`inserted 1 ${feedId} oracle point for ${today}`)
  return {
    status: 'published',
    price: point.price,
    ts: point.ts,
    asOfDay: published.asOfDay,
    ageDays: published.ageDays,
    crossCheckGap,
  }
}
