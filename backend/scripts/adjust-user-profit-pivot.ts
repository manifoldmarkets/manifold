import { runScript } from './run-script'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { chunk } from 'lodash'

if (require.main === module) {
  runScript(async ({ pg }) => {
    const chunkSize = 100
    // const allUserIds = ['AJwLWoo3xue32XIiAVrL5SyR1WB2']
    const allUserIds = await pg.map(
      `
            select id from users where
            data->>'lastBetTime' is not null
            `,
      [],
      (row) => row.id
    )
    const chunks = chunk(allUserIds, chunkSize)
    let total = 0
    for (const userIds of chunks) {
      await updateUserMetricsCore(userIds, true)
      total += userIds.length
      console.log(
        `Updated ${userIds.length} users, total ${total} users updated`
      )
    }
  })
}
