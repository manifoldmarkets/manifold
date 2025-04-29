import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  SeasonEndTimeInfo,
  SeasonStatus,
  getSeasonEndTimeRow,
  insertSeasonEndTime,
  updateSeasonStatus,
  getEffectiveCurrentSeason,
} from 'shared/supabase/leagues'
import { LEAGUES_START } from 'common/leagues'
import { generateNextSeason, insertBots } from 'shared/generate-leagues'
import { sendEndOfSeasonNotificationsAndBonuses } from 'shared/payout-leagues'
import { updateLeague } from './update-league'
import { updateLeagueRanks } from './update-league-ranks'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { HOUR_MS } from 'common/util/time'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

// How many days into the next month the season *could* end (randomly chosen).
const PACIFIC_TIMEZONE = 'America/Los_Angeles'

export async function autoLeaguesCycle() {
  const pg = createSupabaseDirectClient()
  const currentSeason = await getEffectiveCurrentSeason()

  log(`Running autoLeaguesCycle for active season: ${currentSeason}`)

  let seasonInfo = await getSeasonEndTimeRow(pg, currentSeason)
  const now = Date.now()

  // Initialization: Ensure the active season has an end time row.
  if (!seasonInfo) {
    log(`No row found for active season ${currentSeason}. Creating one.`)
    const randomEndTime = calculateRandomEndTime(currentSeason, now)
    await insertSeasonEndTime(pg, currentSeason, randomEndTime) // Inserts with status 'active'
    seasonInfo = await getSeasonEndTimeRow(pg, currentSeason) // Re-fetch
    if (!seasonInfo) {
      log.error(
        `Failed to create and fetch row for season ${currentSeason}! Aborting.`
      )
      return
    }
    log(
      `Created row for season ${currentSeason} with end time ${dayjs(
        seasonInfo.end_time
      )
        .tz(PACIFIC_TIMEZONE)
        .toISOString()}`
    )
  }

  log(
    `Found season info for ${currentSeason}: end_time=${dayjs(
      seasonInfo.end_time
    )
      .tz(PACIFIC_TIMEZONE)
      .toISOString()}, status=${seasonInfo.status}`
  )

  // Check if the season end time has passed and it is currently active.
  if (now >= seasonInfo.end_time && seasonInfo.status === 'active') {
    log(`Season ${currentSeason} end time has passed. Processing rollover...`)
    let nextSeason: number | undefined // Declare outside to use in success log
    try {
      // Wrap the sequence in a transaction
      await pg.tx(async (tx) => {
        // 1. Mark current season as processing
        log(
          `Updating season ${currentSeason} status to 'processing' within transaction.`,
          { season: currentSeason }
        )
        await updateSeasonStatus(tx, currentSeason, 'processing')

        // 2. Run final league updates for the season
        log(
          `Running updateLeague for season ${currentSeason} within transaction...`,
          { season: currentSeason }
        )
        await updateLeague(currentSeason, tx)
        log(
          `Running updateLeagueRanks for season ${currentSeason} within transaction...`,
          { season: currentSeason }
        )
        await updateLeagueRanks(currentSeason, tx)

        // 3. Generate the *next* season's structure
        nextSeason = currentSeason + 1 // Assign here
        log(
          `Generating leagues for next season ${nextSeason} within transaction...`,
          { nextSeason }
        )
        await generateNextSeason(tx, nextSeason)
        await insertBots(tx, nextSeason)

        // 4. Create the row for the *next* season and set its status to active
        log(
          `Creating row for next season ${nextSeason} with status 'active' within transaction.`,
          { nextSeason }
        )
        const nextSeasonEndTime = calculateRandomEndTime(nextSeason, now)
        await insertSeasonEndTime(tx, nextSeason, nextSeasonEndTime)

        // 5. Run first league updates for the *next* season
        log(
          `Running updateLeague for season ${nextSeason} within transaction...`,
          { season: nextSeason }
        )
        await updateLeague(nextSeason, tx)

        log(
          `Running updateLeagueRanks for season ${nextSeason} within transaction...`,
          { season: nextSeason }
        )
        await updateLeagueRanks(nextSeason, tx)

        // 6. Send notifications and bonuses for the *completed* season
        log(
          `Sending end-of-season payouts/notifications for ${currentSeason} within transaction...`,
          { season: currentSeason }
        )
        await sendEndOfSeasonNotificationsAndBonuses(
          tx,
          currentSeason,
          nextSeason
        )

        // 7. Mark the current season as complete
        log(
          `Updating season ${currentSeason} status to 'complete' within transaction.`,
          { season: currentSeason }
        )
        await updateSeasonStatus(tx, currentSeason, 'complete')
      })

      // If the transaction succeeded:
      log(
        `Season ${currentSeason} rollover transaction complete. Season ${
          nextSeason ?? '(unknown)'
        } is now active.`
      )
    } catch (error) {
      // Transaction automatically rolled back on error
      log.error(
        `Error processing season ${currentSeason} rollover transaction. Rolled back automatically.`,
        error instanceof Error ? { err: error } : { data: error }
      )
      // No need for manual status revert, transaction handles it.
    }
  } else if (seasonInfo.status === 'processing') {
    log(`Season ${currentSeason} is already processing. Skipping.`)
  } else if (seasonInfo.status === 'complete') {
    log(
      `Season ${currentSeason} has already been completed. Waiting for next active season.`
    )
    // If getEffectiveCurrentSeason returns this one, there's an issue there or in state management.
    log.warn(
      `getEffectiveCurrentSeason returned ${currentSeason}, but its status is 'complete'. Check logic.`
    )
  } else {
    log(`Season ${currentSeason} end time has not yet passed.`)
  }
}

// Helper to calculate a random end time for a *given* season
const calculateRandomEndTime = (season: number, now: number): Date => {
  // Calculate the start date of the given season
  const seasonStartDate = dayjs(LEAGUES_START)
    .tz(PACIFIC_TIMEZONE)
    .add(season - 1, 'month')

  // Calculate the start of the month *after* the season month
  const minEndTime = seasonStartDate
    .add(1, 'month')
    .startOf('month')
    .tz(PACIFIC_TIMEZONE) // Keep PT

  // Calculate the latest possible end time (start of the day after the offset)
  const latestEndTime = minEndTime
    .add(1, 'day')
    .startOf('day')
    .tz(PACIFIC_TIMEZONE) // Keep PT

  // If the calculated latest end time is somehow *before* the minimum required time,
  if (latestEndTime.isBefore(minEndTime)) {
    log.warn(
      `Calculated latest end time ${latestEndTime.toISOString()} is before minimum end time ${minEndTime.toISOString()} for season ${season}. Using minimum time.`
    )
    return minEndTime.toDate()
  }

  // Generate a random timestamp between min and max end times
  const randomEndTimeMillis =
    minEndTime.valueOf() +
    Math.random() * (latestEndTime.valueOf() - minEndTime.valueOf())

  // Return as a JS Date object
  return dayjs(randomEndTimeMillis).tz(PACIFIC_TIMEZONE).toDate()
}
