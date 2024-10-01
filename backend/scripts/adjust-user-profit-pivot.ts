import { runScript } from './run-script'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { chunk } from 'lodash'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const chunkSize = 250
    // const allUserIds = [['AJwLWoo3xue32XIiAVrL5SyR1WB2', 0]] as [
    //   string,
    //   number
    // ][]
    const allUserIds = await pg.map(
      `
               select distinct users.id, users.created_time from users
               join contract_bets cb on users.id = cb.user_id
               
    --           select id, created_time from users where
    --           data->>'lastBetTime' is not null
              order by created_time
                `,
      [],
      (row) => [row.id, row.created_time]
    )
    console.log('Total users:', allUserIds.length)
    const chunks = chunk(allUserIds, chunkSize)
    let total = 0
    for (const userIds of chunks) {
      await updateUserMetricsCore(
        userIds.map((u) => u[0]),
        0
      )
      total += userIds.length
      console.log(
        `Updated ${userIds.length} users, total ${total} users updated`
      )
      console.log('last created time:', userIds[userIds.length - 1][1])
    }
  })
}
