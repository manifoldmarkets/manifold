import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { eciFrontierOnDate, fetchEciModels } from 'shared/eci'
import { ECI_FRONTIER_FEED_ID, upsertOraclePrices } from 'shared/oracle'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Backfill the `eci-frontier` oracle feed: one point per day, where the value
// is the max ECI score across models released on or before that day. Seeds
// the market chart with the step-function history of frontier capability.
// Start of the ChatGPT era: the ramp from there to today IS this market's
// story, and at daily cadence the chart's 5000-point fetch holds it easily.
const BACKFILL_START = '2023-01-01'

if (require.main === module)
  runScript(async ({ pg }) => {
    const models = await fetchEciModels()
    log(`fetched ${models.length} models from Epoch`)

    // Iterate CALENDAR dates and stamp each day fresh: dayjs.tz + add(1,
    // 'day') adds 24 UTC hours, so a loop started in PST drifts to 1 AM
    // once PDT begins, colliding with the daily job's correct stamps.
    const today = dayjs.tz(dayjs(), 'America/Los_Angeles').format('YYYY-MM-DD')
    const points: { ts: number; price: number }[] = []
    for (
      let d = dayjs.utc(BACKFILL_START);
      !d.isAfter(dayjs.utc(today));
      d = d.add(1, 'day')
    ) {
      const dateStr = d.format('YYYY-MM-DD')
      const frontier = eciFrontierOnDate(models, dateStr)
      if (frontier != null)
        points.push({
          ts: dayjs.tz(dateStr, 'America/Los_Angeles').valueOf(),
          price: frontier,
        })
    }

    log(`computed ${points.length} daily frontier points`)
    if (points.length > 0) {
      const first = points[0]
      const last = points[points.length - 1]
      log(
        `first: ${new Date(first.ts).toISOString()} = ${first.price.toFixed(2)}`
      )
      log(`last: ${new Date(last.ts).toISOString()} = ${last.price.toFixed(2)}`)
    }
    await upsertOraclePrices(pg, ECI_FRONTIER_FEED_ID, points)
    log(`backfilled ${points.length} ${ECI_FRONTIER_FEED_ID} oracle points`)
  })
