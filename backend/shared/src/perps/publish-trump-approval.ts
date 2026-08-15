import * as dayjs from 'dayjs'
import * as timezone from 'dayjs/plugin/timezone'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
dayjs.extend(timezone)

import { TRUMP_APPROVAL_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  computeRollingAverages,
  fetchTrumpApprovalPolls,
  TRUMP_APPROVAL_WINDOW_DAYS,
} from 'shared/trump-approval'
import { log } from 'shared/utils'

// Fetch enough poll history to fully cover today's trailing window, plus a
// safety buffer for long fielding periods (some polls span 2+ weeks).
const FETCH_LOOKBACK_DAYS = TRUMP_APPROVAL_WINDOW_DAYS + 14

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
  | { status: 'published'; price: number; ts: number }
  | { status: 'no-polls'; reason: string }
  | { status: 'rejected'; reason: string }

/**
 * Compute and publish ONE observation of today's rolling value, stamped when
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

  const polls = await fetchTrumpApprovalPolls(fetchStart)
  const points = computeRollingAverages(polls, today, today)
  if (points.length === 0)
    return {
      status: 'no-polls',
      reason: `no polls in trailing ${TRUMP_APPROVAL_WINDOW_DAYS}-day window`,
    }

  const [computedPoint] = points
  const point = { ...computedPoint, ts: Date.now() }
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
      reason: `computed ${point.price.toFixed(2)} but ${rejection}`,
    }

  log(
    `today's ${TRUMP_APPROVAL_WINDOW_DAYS}-day rolling Trump approval average: ${point.price.toFixed(
      2
    )} (${new Date(point.ts).toISOString()})`
  )
  await insertOraclePrices(pg, TRUMP_APPROVAL_FEED_ID, [point])
  await applyOraclePointToLivePerps(pg, TRUMP_APPROVAL_FEED_ID, point)
  log(`inserted 1 ${TRUMP_APPROVAL_FEED_ID} oracle point for ${today}`)
  return { status: 'published', price: point.price, ts: point.ts }
}
