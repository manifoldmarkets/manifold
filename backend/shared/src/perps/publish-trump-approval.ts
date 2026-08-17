import * as dayjs from 'dayjs'
import * as timezone from 'dayjs/plugin/timezone'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
dayjs.extend(timezone)

import {
  TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP,
  TRUMP_APPROVAL_MAX_WINDOW_DAYS,
  computeApprovalPoint,
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

/**
 * Has a point already been published during the given Pacific calendar day?
 *
 * This is what makes the job idempotent across its retry window: the first
 * run of the day that gets a usable response from VoteHub publishes, and
 * every later run that day is a single indexed query and a return.
 */
export const hasTrumpApprovalPointForDay = async (
  pg: SupabaseDirectClient,
  day: string
) => {
  // Derive the end of the window from the NEXT calendar date rather than
  // dayStart.add(1, 'day'): adding a day adds 24 UTC hours, which is off by
  // an hour on both DST transition days and would either miss a published
  // point or double-count one from the adjacent day.
  const dayStart = dayjs.tz(day, TRUMP_APPROVAL_TZ)
  const dayEnd = dayjs.tz(
    dayjs.utc(day).add(1, 'day').format('YYYY-MM-DD'),
    TRUMP_APPROVAL_TZ
  )
  const row = await pg.oneOrNone<{ published: boolean }>(
    `select exists (
       select 1 from oracle_prices
       where feed_id = $1 and ts >= $2 and ts < $3
     ) as published`,
    [TRUMP_APPROVAL_FEED_ID, dayStart.toISOString(), dayEnd.toISOString()]
  )
  return row?.published === true
}

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
  pg: SupabaseDirectClient
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

  // The canary. Computed from the raw polls, never used as the price. A
  // failure to produce it is NOT a reason to withhold a good published value —
  // our estimator gives up in droughts that their time-weighted one handles
  // fine — so an unavailable reference downgrades to "unchecked" and says so.
  const polls = await fetchTrumpApprovalPolls(fetchStart)
  const reference = computeApprovalPoint(toApprovalPolls(polls), today)
  const crossCheckGap = reference.ok
    ? getApprovalCrossCheckGap(published.price, reference.price)
    : null

  if (crossCheckGap == null)
    log.warn(
      `[trump-approval] publishing ${published.price.toFixed(2)} unchecked — ` +
        `no independent reference (${
          reference.ok ? 'gap not computable' : reference.reason
        })`
    )
  else if (crossCheckGap > TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP)
    return {
      status: 'rejected',
      reason:
        `published average ${published.price.toFixed(2)} (as of ` +
        `${published.asOfDay}) is ${crossCheckGap.toFixed(2)} from our own ` +
        `${reference.ok ? reference.price.toFixed(2) : '?'}, over the ` +
        `${TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP} tolerance — not publishing a ` +
        `value two independent computations disagree about`,
    }

  const point = { price: published.price, ts: Date.now() }
  const feed = getOracleFeed(TRUMP_APPROVAL_FEED_ID)
  const prev = await pg.oneOrNone<{ ts: string; price: number | string }>(
    `select ts, price from oracle_prices where feed_id = $1
     order by ts desc limit 1`,
    [TRUMP_APPROVAL_FEED_ID]
  )
  const rejection = feed
    ? validateOraclePoint(
        feed,
        prev
          ? { ts: new Date(prev.ts).getTime(), price: Number(prev.price) }
          : null,
        point
      )
    : `missing OracleFeedDef for ${TRUMP_APPROVAL_FEED_ID}`
  if (rejection)
    return {
      status: 'rejected',
      reason: `published average ${point.price.toFixed(2)} but ${rejection}`,
    }

  log(
    `VoteHub published Trump approval average: ${point.price.toFixed(2)} ` +
      `(as of ${published.asOfDay}, ${published.ageDays}d old); ` +
      `${
        crossCheckGap == null
          ? 'cross-check unavailable'
          : `cross-check gap ${crossCheckGap.toFixed(2)} vs our own ${
              reference.ok ? reference.price.toFixed(2) : '?'
            }`
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
