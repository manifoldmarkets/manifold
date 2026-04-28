import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { log } from 'shared/utils'
import { MANIFOLD_DAU_FEED_ID, upsertOraclePrices } from 'shared/oracle'
import { runScript } from './run-script'

if (require.main === module)
  runScript(async ({ pg }) => {
    const rows = await pg.manyOrNone<{ start_date: string; dav: number }>(
      `select start_date, dav from daily_stats
       where dav is not null
       order by start_date asc`
    )
    const points = rows.map((r) => ({
      ts: dayjs
        .tz(r.start_date, 'America/Los_Angeles')
        .startOf('day')
        .valueOf(),
      price: Number(r.dav),
    }))
    await upsertOraclePrices(pg, MANIFOLD_DAU_FEED_ID, points)
    log(`backfilled ${points.length} ${MANIFOLD_DAU_FEED_ID} oracle points`)
  })
