import * as dayjs from 'dayjs'
import * as timezone from 'dayjs/plugin/timezone'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
dayjs.extend(timezone)

import {
  TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP,
  TRUMP_APPROVAL_MAX_WINDOW_DAYS,
  computeApprovalPoint,
  decideApprovalPublish,
  getApprovalCrossCheckGap,
  readPublishedApprovalAverage,
} from 'common/perps/trump-approval'

import { TRUMP_APPROVAL_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  fetchTrumpApprovalAverage,
  fetchTrumpApprovalPolls,
  toApprovalPolls,
} from 'shared/trump-approval'
import { log } from 'shared/utils'

// Fetch enough poll history to cover the WIDEST window the methodology can
// ask for, not just the nominal 14 days: when polling goes quiet the window
// extends to satisfy TRUMP_APPROVAL_MIN_POLLS, and a lookback that stopped at
// the nominal width would starve exactly the case the floor exists to handle.
// The extra 21 days is buffer for long fielding periods (some polls span 2+
// weeks, so their end_date can trail their start_date well past the bound).
const FETCH_LOOKBACK_DAYS = TRUMP_APPROVAL_MAX_WINDOW_DAYS + 21

export const TRUMP_APPROVAL_TZ = 'America/Los_Angeles'

export const trumpApprovalDay = (now: number = Date.now()) =>
  dayjs.tz(dayjs(now), TRUMP_APPROVAL_TZ).format('YYYY-MM-DD')

export type TrumpApprovalPublishResult =
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
 * Publish ONE observation of VoteHub's current approval average, stamped when
 * it becomes available to the market. Corrections append another observation
 * instead of pretending the revised value was tradable from midnight or
 * rewriting a point that liquidations/funding may already have consumed.
 *
 * Every unsuccessful outcome is REPORTED, never logged here: a thrown fetch
 * error and a returned `no-polls` are the same kind of event to a caller
 * that retries, and only the caller knows whether another attempt is coming.
 * Logging failures at this level is what made an hourly retry loop page
 * hourly for a single outage.
 */
export const publishTrumpApprovalPoint = async (
  pg: SupabaseDirectClient,
  options: { force?: boolean } = {}
): Promise<TrumpApprovalPublishResult> => {
  const now = dayjs.tz(dayjs(), TRUMP_APPROVAL_TZ)
  const fetchStart = now
    .subtract(FETCH_LOOKBACK_DAYS, 'day')
    .format('YYYY-MM-DD')
  const today = now.format('YYYY-MM-DD')

  // The price. Fetched first so a failure here costs one request, not two.
  const published = readPublishedApprovalAverage(
    await fetchTrumpApprovalAverage(),
    today
  )
  if (!published.ok) return { status: 'no-polls', reason: published.reason }

  const prev = await pg.oneOrNone<{ ts: string; price: number | string }>(
    `select ts, price from oracle_prices where feed_id = $1
     order by ts desc limit 1`,
    [TRUMP_APPROVAL_FEED_ID]
  )
  const last = prev
    ? { ts: new Date(prev.ts).getTime(), price: Number(prev.price) }
    : null

  // Decide BEFORE running the cross-check: an unchanged reading is the common
  // case now that this runs hourly, and it costs a second HTTP request and a
  // full window computation to conclude nothing happened.
  // `force` is the operator escape hatch: during an incident the point of
  // running this by hand is to put a fresh stamp on the feed before it
  // crosses maxOraclePriceAgeMs and pauses the engine, which is exactly the
  // case the unchanged-value gate would otherwise refuse.
  const decision = options.force
    ? ({ publish: true, reason: 'forced' } as const)
    : decideApprovalPublish({
        price: published.price,
        last,
        now: Date.now(),
      })
  if (!decision.publish)
    return {
      status: 'unchanged',
      price: published.price,
      reason: decision.reason,
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
  // they folded it in rather than a fact, and the drift it leaves is bounded
  // by our own ~0.17/day movement against a tolerance of 3.
  let reference: ReturnType<typeof computeApprovalPoint> | null = null
  try {
    const polls = await fetchTrumpApprovalPolls(fetchStart)
    reference = computeApprovalPoint(toApprovalPolls(polls), published.asOfDay)
  } catch (err) {
    reference = null
    log.warn(
      `[trump-approval] cross-check reference unavailable: ${
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
      : getApprovalCrossCheckGap(published.price, referencePrice)

  if (crossCheckGap == null)
    log.warn(
      `[trump-approval] publishing ${published.price.toFixed(2)} unchecked — ` +
        `no independent reference (${
          reference == null
            ? 'fetch failed'
            : reference.ok
            ? 'gap not computable'
            : reference.reason
        })`
    )
  else if (crossCheckGap > TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP)
    return {
      status: 'rejected',
      reason:
        `published average ${published.price.toFixed(2)} (as of ` +
        `${published.asOfDay}) is ${crossCheckGap.toFixed(2)} from our own ` +
        `${referenceLabel}, over the ` +
        `${TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP} tolerance — not publishing a ` +
        `value two independent computations disagree about`,
    }

  const point = { price: published.price, ts: Date.now() }
  const feed = getOracleFeed(TRUMP_APPROVAL_FEED_ID)
  const rejection = feed
    ? validateOraclePoint(feed, last, point)
    : `missing OracleFeedDef for ${TRUMP_APPROVAL_FEED_ID}`
  if (rejection)
    return {
      status: 'rejected',
      reason: `published average ${point.price.toFixed(2)} but ${rejection}`,
    }

  log(
    `VoteHub published Trump approval average: ${point.price.toFixed(2)} ` +
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
  await insertOraclePrices(pg, TRUMP_APPROVAL_FEED_ID, [point])
  await applyOraclePointToLivePerps(pg, TRUMP_APPROVAL_FEED_ID, point)
  log(`inserted 1 ${TRUMP_APPROVAL_FEED_ID} oracle point for ${today}`)
  return {
    status: 'published',
    price: point.price,
    ts: point.ts,
    asOfDay: published.asOfDay,
    ageDays: published.ageDays,
    crossCheckGap,
  }
}
