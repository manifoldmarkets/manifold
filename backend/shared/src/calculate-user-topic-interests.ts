import { createSupabaseDirectClient } from 'shared/supabase/init'
import { sum, uniq } from 'lodash'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { ValidatedAPIParams } from 'common/api/schema'

type groupIdsToConversionScore = {
  [groupId: string]: { conversionScore: number }
}
export async function calculateUserTopicInterests(startTime?: number) {
  const startDate = new Date(startTime ?? Date.now() - DAY_MS)
  const end = new Date(startDate.valueOf() + DAY_MS).toISOString()
  const start = startDate.toISOString()
  log(`Calculating user topic interests for ${start}`)
  const pg = createSupabaseDirectClient()
  const userGroupIdsToInteractions = await pg.map(
    `
      select uci.user_id, gc.group_id, json_agg(uci.name) as interactions from user_contract_interactions uci
         join contracts c on uci.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
           where uci.created_time > $1
           and uci.created_time < $2
      group by uci.user_id, gc.group_id`,
    [start, end],
    (row) => [row.user_id, [row.group_id, row.interactions]]
  )
  const userIdsToGroupIdInteractionWeights: {
    [userId: string]: { [groupId: string]: number }
  } = {}

  for (const [userId, groupIdsAndInteractions] of userGroupIdsToInteractions) {
    const groupId = groupIdsAndInteractions[0]
    const interactions = groupIdsAndInteractions[1]
    const weights = interactions.map(
      (
        interaction: ValidatedAPIParams<'record-contract-interaction'>['kind']
      ) => {
        switch (interaction) {
          case 'page bet':
          case 'card bet':
          case 'page repost':
            return 1
          case 'card click':
            return 0.25
          case 'promoted click':
            return 0.1
          case 'page comment':
          case 'card like':
          case 'page share':
          case 'page like':
          default:
            return 0.75
        }
      }
    )
    if (!userIdsToGroupIdInteractionWeights[userId]) {
      userIdsToGroupIdInteractionWeights[userId] = {}
    }
    if (!userIdsToGroupIdInteractionWeights[userId][groupId]) {
      userIdsToGroupIdInteractionWeights[userId][groupId] = 0
    }
    userIdsToGroupIdInteractionWeights[userId][groupId] += sum(weights)
  }

  const userViewedGroupIds = await pg.map(
    `
      select uve.user_id, json_agg(gc.group_id) as group_ids from postgres.public.user_view_events uve
         join contracts c on uve.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
         where uve.created_time > $1
          and uve.created_time < $2
      group by uve.user_id`,
    [start, end],
    (row) => [row.user_id, row.group_ids]
  )
  const userIdsToViewedGroupIds = Object.fromEntries(userViewedGroupIds)
  const allUserIds = uniq([
    ...Object.keys(userIdsToGroupIdInteractionWeights),
    ...Object.keys(userIdsToViewedGroupIds),
  ])
  log(`Writing user topic interests for ${allUserIds.length} users`)
  await Promise.all(
    allUserIds.map(async (userId) => {
      const myGroupWeights = userIdsToGroupIdInteractionWeights?.[userId] ?? {}
      const interactedGroupIds: string[] = Object.keys(myGroupWeights) ?? []
      const viewedGroupIds: string[] = userIdsToViewedGroupIds?.[userId] ?? []
      const allGroupIds = uniq([...interactedGroupIds, ...viewedGroupIds])
      const groupIdsToConversionScore = Object.fromEntries(
        allGroupIds.map((groupId) => [
          groupId,
          {
            conversionScore:
              (myGroupWeights[groupId] ?? 0) /
              (viewedGroupIds.filter((id) => id === groupId).length || 1),
          },
        ])
      ) as groupIdsToConversionScore

      await pg.none(
        `insert into user_topic_interests (user_id, group_ids_to_activity)
           values ($1, $2)`,
        [userId, groupIdsToConversionScore]
      )
    })
  )
}
