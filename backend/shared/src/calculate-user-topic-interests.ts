import { createSupabaseDirectClient } from 'shared/supabase/init'
import { mean, uniq } from 'lodash'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/log'

type groupIdsToConversionScore = {
  [groupId: string]: { conversionScore: number }
}
export async function calculateUserTopicInterests(startTime?: number) {
  const startDate = new Date(startTime ?? Date.now() - DAY_MS)
  const end = new Date(startDate.valueOf() + DAY_MS).toISOString()
  const start = startDate.toISOString()
  const pg = createSupabaseDirectClient()
  const userInteractedGroupIds = await pg.map(
    `
      select uci.user_id, json_agg(gc.group_id) as group_ids from user_contract_interactions uci
         join contracts c on uci.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
           where uci.created_time > $1
           and uci.created_time < $2
           and name not in ('promoted click')
      group by uci.user_id`,
    [start, end],
    (row) => [row.user_id, row.group_ids]
  )
  const userIdsToInteractedGroupIds = Object.fromEntries(userInteractedGroupIds)

  const userViewedGroupIds = await pg.map(
    `
      select ucv.user_id, json_agg(gc.group_id) as group_ids from postgres.public.user_contract_views ucv
         join contracts c on ucv.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
           where (last_page_view_ts > $1
           and last_page_view_ts < $2)
           or (last_card_view_ts > $1
            and last_card_view_ts < $2)
      group by ucv.user_id`,
    [start, end],
    (row) => [row.user_id, row.group_ids]
  )
  const userIdsToViewedGroupIds = Object.fromEntries(userViewedGroupIds)
  const allUserIds = uniq([
    ...Object.keys(userIdsToInteractedGroupIds),
    ...Object.keys(userIdsToViewedGroupIds),
  ])
  log(`Writing user topic interests for ${allUserIds.length} users`)
  await Promise.all(
    allUserIds.map(async (userId) => {
      const interactedGroupIds: string[] =
        userIdsToInteractedGroupIds[userId] ?? []
      const viewedGroupIds: string[] = userIdsToViewedGroupIds[userId] ?? []
      const allGroupIds = uniq([...interactedGroupIds, ...viewedGroupIds])
      const groupIdsToConversionScore = Object.fromEntries(
        allGroupIds.map((groupId) => [
          groupId,
          {
            conversionScore: Math.min(
              interactedGroupIds.filter((id) => id === groupId).length /
                (viewedGroupIds.filter((id) => id === groupId).length || 1),
              1
            ),
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

export const userIdToInterests = async (
  userId: string,
  limit: number
): Promise<{ [groupId: string]: number }> => {
  const pg = createSupabaseDirectClient()
  const userInterestsMaps = await pg.map(
    `select group_ids_to_activity from user_topic_interests
            where user_id = $1
            limit $2`,
    [userId, limit],
    (row) => row.group_ids_to_activity as groupIdsToConversionScore
  )
  if (!userInterestsMaps) return {}
  const allGroupIds = uniq(
    userInterestsMaps.flatMap((groupIdsToConversion) =>
      Object.keys(groupIdsToConversion)
    )
  )

  return Object.fromEntries(
    allGroupIds.map((groupId) => [
      groupId,
      mean(
        userInterestsMaps.map(
          (groupIdsToConversionScores) =>
            groupIdsToConversionScores[groupId]?.conversionScore ?? 0
        )
      ),
    ])
  )
}
