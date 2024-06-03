import { createSupabaseDirectClient } from 'shared/supabase/init'
import { forEach, groupBy, mapValues, mean, sum, uniq } from 'lodash'
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
import { FEED_CARD_CONVERSION_PRIOR } from 'common/feed'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'

type groupIdsToConversionScore = {
  [groupId: string]: { conversionScore: number }
}
const IGNORE_GROUP_IDS = [
  'Lokp5JWIA0BDlEPePSfS', // testing group
]
const BETS_ONLY_FOR_SCORE = [
  UNSUBSIDIZED_GROUP_ID,
  UNRANKED_GROUP_ID,
  ...IGNORE_GROUP_IDS,
]
const PAGE_VIEW_OR_CLICK_BENEFIT = 1
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
  const userSeenContractIds: string[] = []
  const userCardViewedGroupIds = await pg.map(
    `
        select ucv.user_id, gc.group_id, ucv.contract_id 
        from user_contract_views ucv
        join contracts c on ucv.contract_id = c.id
        join group_contracts gc on c.id = gc.contract_id
        where card_views > 0
          and ucv.last_card_view_ts > $1
          and ucv.last_card_view_ts < $2
          and c.visibility = 'public'
          and ($3 is null or user_id = $3)
          and gc.group_id not in ($4:list)
    `,
    [start, end, testUserId, IGNORE_GROUP_IDS],
    (row) => {
      const { user_id, group_id, contract_id } = row
      userSeenContractIds.push(contract_id)
      return [user_id as string, group_id as string]
    }
  )
  // Bc of how user_contract_views is designed, we may have a card view yesterday
  // that was overwritten by a view today of the same card. If we clicked on the card
  // yesterday, we definitely saw it.
  const missingCardViewedGroupIds = await pg.map(
    `
    select uci.user_id, gc.group_id from user_contract_interactions uci
    join contracts c on uci.contract_id = c.id
    join group_contracts gc on c.id = gc.contract_id
    where uci.name in ('card click', 'card bet', 'card like')
      and uci.created_time > $1
      and uci.created_time < $2
      and c.visibility = 'public'
      and ($3 is null or user_id = $3)
      and gc.group_id not in ($4:list)
      and ($5 is null or c.id not in ($5:list))
    `,
    [
      start,
      end,
      testUserId,
      IGNORE_GROUP_IDS,
      userSeenContractIds.length > 0 ? userSeenContractIds : null,
    ],
    (row) => [row.user_id as string, row.group_id as string]
  )
  userCardViewedGroupIds.push(...missingCardViewedGroupIds)

  const userGroupIdsToInteractions = await pg.map(
    `
      select uci.user_id, gc.group_id, json_agg(uci.name) as interactions from user_contract_interactions uci
         join contracts c on uci.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
           where uci.created_time > $1
           and uci.created_time < $2
           and c.visibility = 'public'
           and uci.name not in ('promoted click')
           and ($3 is null or user_id = $3)
           and gc.group_id not in ($4:list)
      group by uci.user_id, gc.group_id`,
    [start, end, testUserId, BETS_ONLY_FOR_SCORE],
    (row) => [row.user_id, [row.group_id, row.interactions]]
  )
  const userIdsToGroupIdInteractionWeights: {
    [userId: string]: { [groupId: string]: { card: number[]; page: number[] } }
  } = {}

  const addWeight = (
    userId: string,
    groupId: string,
    weight: number,
    type: 'page' | 'card'
  ): void => {
    if (!userIdsToGroupIdInteractionWeights[userId]) {
      userIdsToGroupIdInteractionWeights[userId] = {}
    }
    if (!userIdsToGroupIdInteractionWeights[userId][groupId]) {
      userIdsToGroupIdInteractionWeights[userId][groupId] = {
        page: [],
        card: [],
      }
    }
    userIdsToGroupIdInteractionWeights[userId][groupId][type].push(weight)
  }

  for (const [userId, groupIdsAndInteractions] of userGroupIdsToInteractions) {
    const [groupId, interactions] = groupIdsAndInteractions
    forEach(
      interactions,
      (
        interaction: ValidatedAPIParams<'record-contract-interaction'>['kind']
      ) => {
        switch (interaction) {
          case 'card bet':
            addWeight(userId, groupId, 2, 'card')
            break
          case 'page bet':
            addWeight(userId, groupId, 2, 'page')
            break
          case 'card like':
            addWeight(userId, groupId, 1.25, 'card')
            break
          case 'page repost':
          case 'page share':
          case 'page like':
            addWeight(userId, groupId, 1.25, 'page')
            break
          case 'page comment':
            addWeight(
              userId,
              groupId,
              isAdminId(userId) || isModId(userId) ? 1.1 : 1.25,
              'page'
            )
            break
          case 'card click':
            addWeight(userId, groupId, PAGE_VIEW_OR_CLICK_BENEFIT, 'card')
            break
          default:
            log(`Unknown interaction: ${interaction}`)
            break
        }
      }
    )
  }

  const userPageViewedGroupIds = await pg.map(
    `
      select uve.user_id, gc.group_id from user_view_events uve
         join contracts c on uve.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
         where uve.created_time > $1
         and uve.created_time < $2
         and c.visibility = 'public'
         and name = 'page'
         and ($3 is null or user_id = $3)
         and gc.group_id not in ($4:list)
    `,
    [start, end, testUserId, IGNORE_GROUP_IDS],
    (row) => {
      const { user_id, group_id } = row
      // Unranked page views are not a conversion, bets are the only way to convert here.
      if (!BETS_ONLY_FOR_SCORE.includes(group_id)) {
        addWeight(user_id, group_id, PAGE_VIEW_OR_CLICK_BENEFIT, 'page')
      }
      return [user_id as string, group_id as string]
    }
  )
  const pageViewsByUser = groupBy(userPageViewedGroupIds, (row) => row[0])
  const cardViewsByUser = groupBy(userCardViewedGroupIds, (row) => row[0])

  const userIdsToViewedCardGroupIds = mapValues(cardViewsByUser, (rows) =>
    rows.map((row) => row[1])
  )
  const userIdsToViewedPageGroupIds = mapValues(pageViewsByUser, (rows) =>
    rows.map((row) => row[1])
  )

  const allUserIds = uniq([
    ...Object.keys(userIdsToGroupIdInteractionWeights),
    ...Object.keys(userIdsToViewedCardGroupIds),
    ...Object.keys(userIdsToViewedPageGroupIds),
  ])
  // Clear out previous priors
  for (const userId of Object.keys(userIdsToAverageTopicConversionScores)) {
    delete userIdsToAverageTopicConversionScores[userId]
  }
  // TODO: we will want to filter for only interests calculated in this run when backfilling
  await buildUserInterestsCache(allUserIds)
  log(`Writing user topic interests for ${allUserIds.length} users`)
  const scoresToWrite = filterDefined(
    allUserIds.map((userId) => {
      const myPriorConversionScores =
        userIdsToAverageTopicConversionScores[userId] ?? {}
      const myPriorGroupIds = Object.keys(myPriorConversionScores)
      const myGroupWeights = userIdsToGroupIdInteractionWeights?.[userId] ?? {}
      const interactedGroupIds = Object.keys(myGroupWeights) ?? []
      const cardViewedGroupIds = userIdsToViewedCardGroupIds?.[userId] ?? []
      const pageViewedGroupIds = userIdsToViewedPageGroupIds?.[userId] ?? []
      const allGroupIds = uniq([
        ...interactedGroupIds,
        ...cardViewedGroupIds,
        ...pageViewedGroupIds,
        ...myPriorGroupIds,
      ])
      // Factors to consider:
      // probability user clicked market bc of a different topic (prob of other topics)
      // probability market is miscategorized
      const groupIdsToConversionScore = Object.fromEntries(
        allGroupIds.map((groupId) => {
          const prior =
            myPriorConversionScores[groupId] ?? FEED_CARD_CONVERSION_PRIOR
          const priorStrength = 20
          const alpha = priorStrength * prior
          const beta = (1 - prior) * priorStrength
          const cardWeights = myGroupWeights[groupId]?.card ?? [0]
          const pageWeights = myGroupWeights[groupId]?.page ?? [0]
          const cardViews = cardViewedGroupIds.filter(
            (id) => id === groupId
          ).length
          const pageViews = pageViewedGroupIds.filter(
            (id) => id === groupId
          ).length
          return [
            groupId,
            {
              conversionScore: mean([
                clampValue(
                  sum([...cardWeights, alpha]) / sum([cardViews, beta])
                ),
                clampValue(
                  sum([...pageWeights, alpha]) / sum([pageViews, beta])
                ),
              ]),
            },
          ]
        })
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

const clampValue = (value: number): number => Math.min(Math.max(value, 0), 10)
