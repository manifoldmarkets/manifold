import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { eciFrontierOnDate, fetchEciModels } from 'shared/eci'
import { ECI_FRONTIER_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'

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

  const point = { ts: Date.now(), price: frontier }
  const feed = getOracleFeed(ECI_FRONTIER_FEED_ID)
  const prev = await pg.oneOrNone<{ ts: string; price: number | string }>(
    `select ts, price from oracle_prices where feed_id = $1
     order by ts desc limit 1`,
    [ECI_FRONTIER_FEED_ID]
  )
  const rejection = feed
    ? validateOraclePoint(
        feed,
        prev
          ? { ts: new Date(prev.ts).getTime(), price: Number(prev.price) }
          : null,
        point
      )
    : `missing OracleFeedDef for ${ECI_FRONTIER_FEED_ID}`
  if (rejection) {
    log.error(`[eci] rejected frontier point ${frontier} — ${rejection}`)
    return
  }

  await insertOraclePrices(pg, ECI_FRONTIER_FEED_ID, [point])
  await applyOraclePointToLivePerps(pg, ECI_FRONTIER_FEED_ID, point)
  log(`[eci] inserted frontier ${frontier.toFixed(2)} for ${todayStr}`)
}
