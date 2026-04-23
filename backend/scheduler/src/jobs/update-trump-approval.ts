import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { TRUMP_APPROVAL_FEED_ID, upsertOraclePrices } from 'shared/oracle'
import {
  computeRollingAverages,
  fetchTrumpApprovalPolls,
  TRUMP_APPROVAL_WINDOW_DAYS,
} from 'shared/trump-approval'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Fetch enough poll history to fully cover today's trailing window, plus a
// safety buffer for long fielding periods (some polls span 2+ weeks).
const FETCH_LOOKBACK_DAYS = TRUMP_APPROVAL_WINDOW_DAYS + 14

// Only ever writes a single oracle point, for today, using whatever polls are
// available at run time. Past days are treated as immutable: perps have
// already liquidated / funded / settled trades against those prices, and
// silently revising them after the fact would desync the chart from the
// engine's history. If a poll is late-reported with an end_date in a prior
// day's window, that poll will still influence today's average (because it
// falls inside today's trailing window) — we just don't retroactively change
// prior days.
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
    log(`no polls in trailing ${TRUMP_APPROVAL_WINDOW_DAYS}-day window; skipping`)
    return
  }
  const [point] = points
  log(
    `today's ${TRUMP_APPROVAL_WINDOW_DAYS}-day rolling Trump approval average: ${point.price.toFixed(
      2
    )} (${new Date(point.ts).toISOString()})`
  )
  await upsertOraclePrices(pg, TRUMP_APPROVAL_FEED_ID, [point])
  log(`upserted 1 ${TRUMP_APPROVAL_FEED_ID} oracle point for ${today}`)
}
