import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { eciFrontierOnDate, fetchEciModels } from 'shared/eci'
import { ECI_FRONTIER_FEED_ID, upsertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Daily ECI-frontier oracle point (same shape as update-trump-approval).
// Writes exactly one point, for today, even when the frontier is unchanged —
// feed freshness then reflects job health, not model-release cadence. Past
// days are immutable: Epoch occasionally revises model scores, but trades
// have already settled against the history we published.
export const updateEci = async () => {
  const pg = createSupabaseDirectClient()

  const today = dayjs.tz(dayjs(), 'America/Los_Angeles')
  const todayStr = today.format('YYYY-MM-DD')

  const models = await fetchEciModels()
  const frontier = eciFrontierOnDate(models, todayStr)
  if (frontier == null) {
    log.error('[eci] no models with valid release dates — skipping')
    return
  }

  const point = { ts: today.startOf('day').valueOf(), price: frontier }
  const feed = getOracleFeed(ECI_FRONTIER_FEED_ID)
  const rejection = feed ? validateOraclePoint(feed, null, point) : null
  if (rejection) {
    log.error(`[eci] rejected frontier point ${frontier} — ${rejection}`)
    return
  }

  await upsertOraclePrices(pg, ECI_FRONTIER_FEED_ID, [point])
  log(`[eci] upserted frontier ${frontier.toFixed(2)} for ${todayStr}`)
}
