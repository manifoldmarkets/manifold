import { runScript } from './run-script'
import { chunk } from 'lodash'
import { updateUserMetricsWithBets } from 'shared/update-user-metrics-with-bets'
import { WEEK_MS } from 'common/util/time'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const chunkSize = 50
    // const allUserIds = [['AJwLWoo3xue32XIiAVrL5SyR1WB2', 0]] as [
    //   string,
    //   number
    // ][]
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
      await updateUserMetricsWithBets(
        userIds.map((u) => u[0]),
        Date.now() - WEEK_MS
      )
      total += userIds.length
      console.log(
        `Updated ${userIds.length} users, total ${total} users updated`
      )
      console.log('last created time:', userIds[userIds.length - 1][1])
    }
  })
}
