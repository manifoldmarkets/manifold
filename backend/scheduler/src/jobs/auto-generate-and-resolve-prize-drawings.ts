import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'

import { type SweepstakesPrize } from 'common/sweepstakes'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  createSweepstakes,
  selectSweepstakesWinners,
  SweepstakesError,
} from 'shared/sweepstakes'
import { log } from 'shared/utils'

dayjs.extend(utc)
dayjs.extend(timezone)

const PACIFIC_TIMEZONE = 'America/Los_Angeles'
const DAILY_PRIZES: SweepstakesPrize[] = [
  { rank: 1, amountUsdc: 100, label: '1st' },
]

export async function autoGenerateAndResolvePrizeDrawings() {
  const pg = createSupabaseDirectClient()
  const unresolvedDrawings = await pg.manyOrNone<{
    sweepstakes_num: number
  }>(
    `SELECT sweepstakes_num
     FROM sweepstakes
     WHERE close_time <= NOW()
       AND winning_ticket_ids IS NULL
     ORDER BY close_time ASC`
  )

  for (const drawing of unresolvedDrawings) {
    try {
      const result = await selectSweepstakesWinners(
        pg,
        drawing.sweepstakes_num
      )
      log(
        `Resolved Prize Drawing #${drawing.sweepstakes_num} with ${result.winners.length} winner(s).`
      )
    } catch (err) {
      log.error(
        `Failed to resolve Prize Drawing #${drawing.sweepstakes_num}.`,
        { err }
      )
    }
  }

  const activeDrawing = await pg.oneOrNone<{
    sweepstakes_num: number
  }>(
    `SELECT sweepstakes_num
     FROM sweepstakes
     WHERE close_time > NOW()
     ORDER BY close_time DESC
     LIMIT 1`
  )

  if (activeDrawing) {
    log(
      `Skipping daily prize drawing creation because Prize Drawing #${activeDrawing.sweepstakes_num} is still active.`
    )
    return
  }

  const closeTime = dayjs()
    .tz(PACIFIC_TIMEZONE)
    .add(1, 'day')
    .hour(12)
    .minute(0)
    .second(0)
    .millisecond(0)
    .valueOf()

  try {
    const result = await createSweepstakes(pg, closeTime, DAILY_PRIZES)
    log(
      `Created Prize Drawing #${result.sweepstakesNum}, closing at ${new Date(
        closeTime
      ).toISOString()}.`
    )
  } catch (err) {
    if (
      err instanceof SweepstakesError &&
      err.message === 'An active drawing already exists'
    ) {
      log('Skipping daily prize drawing creation because one is already active.')
      return
    }
    throw err
  }
}
