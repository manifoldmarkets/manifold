import * as dayjs from 'dayjs'
import * as timezone from 'dayjs/plugin/timezone'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
dayjs.extend(timezone)

import { TRUMP_APPROVAL_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  computeRollingAverages,
  fetchTrumpApprovalPolls,
  TRUMP_APPROVAL_WINDOW_DAYS,
} from 'shared/trump-approval'
import { log } from 'shared/utils'

// Fetch enough poll history to fully cover today's trailing window, plus a
// safety buffer for long fielding periods (some polls span 2+ weeks).
const FETCH_LOOKBACK_DAYS = TRUMP_APPROVAL_WINDOW_DAYS + 14

// Writes one observation of today's rolling value, stamped when it becomes
// available to the market. Corrections append another observation instead of
// pretending the revised value was tradable from midnight or rewriting a
// point that liquidations/funding may already have consumed.
export const updateTrumpApproval = async () => {
  const pg = createSupabaseDirectClient()

  const now = dayjs.tz(dayjs(), 'America/Los_Angeles')
  const fetchStart = now
    .subtract(FETCH_LOOKBACK_DAYS, 'day')
    .format('YYYY-MM-DD')
  const today = now.format('YYYY-MM-DD')

  const polls = await fetchTrumpApprovalPolls(fetchStart)
  const points = computeRollingAverages(polls, today, today)
  if (points.length === 0) {
    log(
      `no polls in trailing ${TRUMP_APPROVAL_WINDOW_DAYS}-day window; skipping`
    )
    return
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
  if (rejection) {
    log.error(
      `[trump-approval] rejected ${point.price.toFixed(2)} — ${rejection}`
    )
    return
  }

  log(
    `today's ${TRUMP_APPROVAL_WINDOW_DAYS}-day rolling Trump approval average: ${point.price.toFixed(
      2
    )} (${new Date(point.ts).toISOString()})`
  )
  await insertOraclePrices(pg, TRUMP_APPROVAL_FEED_ID, [point])
  await applyOraclePointToLivePerps(pg, TRUMP_APPROVAL_FEED_ID, point)
  log(`inserted 1 ${TRUMP_APPROVAL_FEED_ID} oracle point for ${today}`)
}
