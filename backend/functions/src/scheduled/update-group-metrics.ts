import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, mapValues, sortBy } from 'lodash'

import { log } from 'shared/utils'
import { newEndpointNoAuth } from '../api/helpers'
import { invokeFunction } from 'shared/utils'
import { getIds } from 'shared/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const scheduleUpdateGroupMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updategroupmetrics'))
    } catch (e) {
      console.error(e)
    }
  })

export const updategroupmetrics = newEndpointNoAuth(
  {
    timeoutSeconds: 2000,
    memory: '2GiB',
    minInstances: 0,
    secrets: ['SUPABASE_PASSWORD'],
  },
  async (_req) => {
    await updateGroupMetrics()
    return { success: true }
  }
)

export async function updateGroupMetrics() {
  const firestore = admin.firestore()
  const pg = createSupabaseDirectClient()
  log('Loading group IDs...')
  const groupIds = await getIds(pg, 'groups')
  log(`Loaded ${groupIds.length} group IDs.`)

  log(`Loading contract creator scores...`)
  const groupCreatorScores = await pg.manyOrNone(
    `with creator_scores as (
      select
        gc.group_id, c.data->>'creatorId' as user_id, count(*) as score,
        row_number() over (partition by gc.group_id order by count(*) desc) as nth
      from group_contracts as gc
      join contracts as c on gc.contract_id = c.id
      join user_contract_metrics as ucm on ucm.contract_id = gc.contract_id
      group by gc.group_id, c.data->>'creatorId'
    )
    select * from creator_scores where nth <= 50`
  )
  const creatorScoresByGroup = mapValues(
    groupBy(groupCreatorScores, (r) => r.group_id as string),
    (rows) =>
      rows.map((r) => ({
        userId: r.user_id as string,
        score: parseFloat(r.score as string),
      }))
  )

  log(`Loading contract profit scores...`)
  const groupProfitScores = await pg.manyOrNone(
    `with profit_scores as (
      select
        gc.group_id, ucm.user_id, sum((ucm.data->'profit')::numeric) as score,
        row_number() over (partition by gc.group_id order by sum((ucm.data->'profit')::numeric) desc) as nth
      from group_contracts as gc
      join user_contract_metrics as ucm on ucm.contract_id = gc.contract_id
      group by gc.group_id, ucm.user_id
    )
    select * from profit_scores where nth <= 50`
  )
  const profitScoresByGroup = mapValues(
    groupBy(groupProfitScores, (r) => r.group_id as string),
    (rows) =>
      rows.map((r) => ({
        userId: r.user_id as string,
        score: parseFloat(r.score as string),
      }))
  )

  log('Updating leaderboards...')
  const writer = firestore.bulkWriter()
  for (const groupId of groupIds) {
    const topTraderScores = profitScoresByGroup[groupId] ?? []
    const topCreatorScores = creatorScoresByGroup[groupId] ?? []
    const doc = firestore.collection('groups').doc(groupId)
    writer.update(doc, {
      cachedLeaderboard: {
        topTraders: sortBy(topTraderScores, (x) => -x.score),
        topCreators: sortBy(topCreatorScores, (x) => -x.score),
      },
    })
  }

  log('Committing writes...')
  await writer.close()
  log('Done.')
}
