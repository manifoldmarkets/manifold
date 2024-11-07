import { runScript } from './run-script'
import { chunk } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { updateUserMetricsWithBets } from 'shared/update-user-metrics-with-bets'

const chunkSize = 10
const FIX_PERIODS = true
if (require.main === module) {
  runScript(async ({ pg }) => {
    // const allUserIds = [['AJwLWoo3xue32XIiAVrL5SyR1WB2', 0]] as [
    //   string,
    //   number
    // ][]
    if (FIX_PERIODS) {
      await fixUserPeriods(pg)
      return
    }

    const startTime = new Date(0).toISOString()
    const allUserIds = await pg.map(
      `
       select distinct users.id, users.created_time from users
       join contract_bets cb on users.id = cb.user_id
       where users.created_time > $1
--        and cb.created_time > now () - interval '2 week'
       order by users.created_time
                `,
      [startTime],
      (row) => [row.id, row.created_time]
    )
    console.log('Total users:', allUserIds.length)
    const chunks = chunk(allUserIds, chunkSize)
    let total = 0
    for (const userIds of chunks) {
      await updateUserMetricsWithBets(userIds.map((u) => u[0]))
      total += userIds.length
      console.log(
        `Updated ${userIds.length} users, total ${total} users updated`
      )
      console.log('last created time:', userIds[userIds.length - 1][1])
    }
  })
}

const fixUserPeriods = async (pg: SupabaseDirectClient) => {
  const allUserIds = await pg.map(
    `
      select distinct ucm.user_id from user_contract_metrics ucm
      join contracts on ucm.contract_id = contracts.id
      where resolution_time < now() - interval '7 day'
      and (((ucm.data->'from'->'week'->'profit')::numeric) > 0.01 or
          ((ucm.data->'from'->'week'->'profit')::numeric) <-0.01);
      `,
    [],
    (row) => [row.user_id, '']
  )
  console.log('Total users:', allUserIds.length)
  const chunks = chunk(allUserIds, chunkSize)
  let total = 0
  for (const userIds of chunks) {
    await updateUserMetricPeriods(
      userIds.map((u) => u[0]),
      0
    )
    total += userIds.length
    console.log(`Updated ${userIds.length} users, total ${total} users updated`)
    console.log('last created time:', userIds[userIds.length - 1][1])
  }
}
