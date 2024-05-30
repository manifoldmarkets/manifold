import { createSupabaseDirectClient } from 'shared/supabase/init'
import { groupBy, mapValues, sum, uniq } from 'lodash'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { ValidatedAPIParams } from 'common/api/schema'
import { bulkInsert } from 'shared/supabase/utils'
import { filterDefined } from 'common/util/array'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import { isAdminId, isModId } from 'common/envs/constants'

type groupIdsToConversionScore = {
  [groupId: string]: { conversionScore: number }
}
const BETS_ONLY_FOR_SCORE = [UNSUBSIDIZED_GROUP_ID, UNRANKED_GROUP_ID]
const VIEW_COST = 0.02
const CLICK_BENEFIT = 0.05
export async function calculateUserTopicInterests(
  startTime?: number,
  readOnly?: boolean,
  testUserId?: string
) {
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
           and c.visibility = 'public'
           and uci.name not in ('page bet', 'card bet') -- we use bets from contract_bets
           and ($3 is null or user_id = $3)
           and gc.group_id not in ($4:list)
      group by uci.user_id, gc.group_id`,
    [start, end, testUserId, BETS_ONLY_FOR_SCORE],
    (row) => [row.user_id, [row.group_id, row.interactions]]
  )
  const userIdsToGroupIdInteractionWeights: {
    [userId: string]: { [groupId: string]: number }
  } = {}

  const addWeight = (userId: string, groupId: string, weight: number): void => {
    if (!userIdsToGroupIdInteractionWeights[userId]) {
      userIdsToGroupIdInteractionWeights[userId] = {}
    }
    if (!userIdsToGroupIdInteractionWeights[userId][groupId]) {
      userIdsToGroupIdInteractionWeights[userId][groupId] = 0
    }
    userIdsToGroupIdInteractionWeights[userId][groupId] += Math.abs(weight)
  }

  for (const [userId, groupIdsAndInteractions] of userGroupIdsToInteractions) {
    const [groupId, interactions] = groupIdsAndInteractions
    const weights = interactions.map(
      (
        interaction: ValidatedAPIParams<'record-contract-interaction'>['kind']
      ) => {
        switch (interaction) {
          case 'page repost':
          case 'card like':
          case 'page share':
          case 'page like':
            return 0.25
          case 'page comment':
            return isAdminId(userId) || isModId(userId) ? 0.1 : 0.2
          case 'card click':
            return CLICK_BENEFIT
          case 'promoted click':
            return VIEW_COST
          default:
            return 0
        }
      }
    )
    const weight = sum(weights)
    addWeight(userId, groupId, weight)
  }

  await pg.map(
    `
        select distinct on (cb.created_time, cb.user_id, gc.group_id)
        cb.user_id, gc.group_id from contract_bets cb
           join contracts c on cb.contract_id = c.id
           join group_contracts gc on c.id = gc.contract_id
        where cb.created_time > $1
          and cb.created_time < $2
          and is_redemption = false
          and c.visibility = 'public'
          and ($3 is null or user_id = $3)
        `,
    [start, end, testUserId],
    (row) => {
      addWeight(row.user_id, row.group_id, 1)
    }
  )
  const userViewedGroupIds = await pg.map(
    `
      select uve.user_id, gc.group_id, uve.name from postgres.public.user_view_events uve
         join contracts c on uve.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
         where uve.created_time > $1
         and uve.created_time < $2
         and c.visibility = 'public'
         and ($3 is null or user_id = $3)
         and gc.group_id not in ($4:list)
    `,
    [start, end, testUserId, BETS_ONLY_FOR_SCORE],
    (row) => {
      const { name, user_id, group_id } = row
      if (name === 'page') addWeight(user_id, group_id, CLICK_BENEFIT)
      return [user_id, group_id]
    }
  )
  const byUserId = groupBy(userViewedGroupIds, (row) => row[0])
  const userIdsToViewedGroupIds = mapValues(byUserId, (rows) =>
    rows.map((row) => row[1])
  )

  const allUserIds = uniq([
    ...Object.keys(userIdsToGroupIdInteractionWeights),
    ...Object.keys(userIdsToViewedGroupIds),
  ])
  log(`Writing user topic interests for ${allUserIds.length} users`)
  const scoresToWrite = filterDefined(
    allUserIds.map((userId) => {
      const myGroupWeights = userIdsToGroupIdInteractionWeights?.[userId] ?? {}
      const interactedGroupIds: string[] = Object.keys(myGroupWeights) ?? []
      const viewedGroupIds: string[] = userIdsToViewedGroupIds?.[userId] ?? []
      const allGroupIds = uniq([...interactedGroupIds, ...viewedGroupIds])
      const groupIdsToConversionScore = Object.fromEntries(
        allGroupIds.map((groupId) => [
          groupId,
          {
            // Clamp scores between [0, 10]
            conversionScore: Math.min(
              Math.max(
                1 +
                  ((myGroupWeights[groupId] ?? 0) -
                    (viewedGroupIds.filter((id) => id === groupId).length ||
                      1) *
                      VIEW_COST),
                0
              ),
              10
            ),
          },
        ])
      ) as groupIdsToConversionScore

      if (
        Object.keys(groupIdsToConversionScore).length === 0 ||
        Object.values(groupIdsToConversionScore).some(
          (v) =>
            v.conversionScore === null ||
            v.conversionScore === undefined ||
            isNaN(v.conversionScore) ||
            v.conversionScore < 0
        )
      ) {
        log.error('Skipping conversion score writes for user: ' + userId)
        return undefined
      }

      return {
        user_id: userId,
        group_ids_to_activity: groupIdsToConversionScore,
        created_time: start,
      }
    })
  )
  if (!readOnly) await bulkInsert(pg, 'user_topic_interests', scoresToWrite)
}
