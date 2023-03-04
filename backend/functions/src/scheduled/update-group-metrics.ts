import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { groupBy, mapValues, sortBy } from 'lodash'

import { log } from 'shared/utils'
import { newEndpointNoAuth } from '../api/helpers'
import { invokeFunction } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const firestore = admin.firestore()

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
  { timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 },
  async (_req) => {
    await updateGroupMetrics()
    return { success: true }
  }
)

export async function updateGroupMetrics() {
  const pg = createSupabaseDirectClient()
  log('Loading groups...')
  const groups = await firestore.collection('groups').select().get()
  log(`Loaded ${groups.size} groups.`)

  log(`Loading contract creator scores...`)
  const groupCreatorScores = await pg.manyOrNone(
    `with creator_scores as (
      select gc.group_id, c.data->>'creatorId' as user_id, count(*) as score
      from group_contracts as gc
      join contracts as c on gc.contract_id = c.id
      join user_contract_metrics as ucm on ucm.contract_id = gc.contract_id
      group by gc.group_id, c.data->>'creatorId'
    ), ranked_scores as (
      select *, rank() over (partition by group_id order by score desc, user_id) as nth
      from creator_scores
    )
    select * from ranked_scores where nth <= 50`
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
      select gc.group_id, ucm.user_id, sum((ucm.data->'profit')::numeric) as score
      from group_contracts as gc
      join user_contract_metrics as ucm on ucm.contract_id = gc.contract_id
      group by gc.group_id, ucm.user_id
    ), ranked_scores as (
      select *, rank() over (partition by group_id order by score desc, user_id) as nth
      from profit_scores
    )
    select * from ranked_scores where nth <= 50`
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
  for (const doc of groups.docs) {
    const topTraderScores = profitScoresByGroup[doc.id] ?? []
    const topCreatorScores = creatorScoresByGroup[doc.id] ?? []
    writer.update(doc.ref, {
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
