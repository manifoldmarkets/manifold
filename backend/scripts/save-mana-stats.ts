import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)
import { runScript } from './run-script'
import {
  updateTxnStats,
  updateManaStatsBetween,
} from 'shared/calculate-mana-stats'
import { revalidateStaticProps } from 'shared/utils'

runScript(async ({ pg }) => {
  const endDay = dayjs().tz('America/Los_Angeles')
  const start = endDay.subtract(7, 'day').startOf('day').valueOf()
  await updateTxnStats(pg, start, 7)
  await updateManaStatsBetween(pg, start, 7)

  await revalidateStaticProps('/stats')
})
