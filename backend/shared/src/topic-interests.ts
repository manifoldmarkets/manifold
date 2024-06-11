import { log } from 'shared/monitoring/log'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { chunk } from 'lodash'
import { FOLLOWED_TOPIC_CONVERSION_PRIOR } from 'common/feed'
import {
  from,
  join,
  orderBy as order,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { GROUP_SLUGS_TO_NOT_INTRODUCE_IN_FEED } from 'common/envs/constants'

export type TopicToInterestWeights = { [groupId: string]: number }
export const userIdsToAverageTopicConversionScores: {
  [userId: string]: TopicToInterestWeights
} = {}

export const activeTopics: { [topicId: string]: number } = {}

export const buildUserInterestsCache = async (userIds: string[]) => {
  log('Starting user topic interests cache build process')
  const pg = createSupabaseDirectClient()
  if (
    userIds.every(
      (uid) =>
        Object.keys(userIdsToAverageTopicConversionScores[uid] ?? {}).length > 0
    )
  ) {
    return
  }

  log('building cache for users: ', userIds.length)
  if (Object.keys(activeTopics).length === 0) await refreshActiveTopics(pg)
  const topicIdsMeetingMinimumBar = Object.keys(activeTopics)
  // Refresh the cache, and use the old one in the meantime
  refreshActiveTopics(pg)

  const chunks = chunk(userIds, 1000)
  for (const userIds of chunks) {
    await Promise.all([
      ...userIds.map(async (userId) => {
        userIdsToAverageTopicConversionScores[userId] = {}
        const [followedTopics, _] = await Promise.all([
          getFollowedTopics(pg, userId),
          pg.map(
            `
              select distinct uti.*
              from get_user_topic_interests_2($1) as uti
              where uti.group_id in ($2:list)
              order by uti.score desc
          `,
            [userId, topicIdsMeetingMinimumBar],
            (r) => {
              userIdsToAverageTopicConversionScores[userId][r.group_id] =
                r.score
            }
          ),
        ])
        for (const groupId of followedTopics) {
          const hasFewInterests =
            Object.keys(userIdsToAverageTopicConversionScores[userId]).length <=
            25
          const groupScore =
            userIdsToAverageTopicConversionScores[userId][groupId]
          if (groupScore === undefined) {
            userIdsToAverageTopicConversionScores[userId][groupId] =
              FOLLOWED_TOPIC_CONVERSION_PRIOR
          } else {
            userIdsToAverageTopicConversionScores[userId][groupId] = Math.min(
              groupScore +
                FOLLOWED_TOPIC_CONVERSION_PRIOR * (hasFewInterests ? 0.5 : 0.3),
              1
            )
          }
        }
      }),
    ])

    log(
      'built topic interests cache for users: ',
      Object.keys(userIdsToAverageTopicConversionScores).length
    )
  }
  log('built user topic interests cache')
}

const getFollowedTopics = async (pg: SupabaseDirectClient, userId: string) => {
  return await pg.map(
    `select group_id from group_members where member_id = $1`,
    [userId],
    (row) => row.group_id as string
  )
}

export const minimumContractsQualityBarWhereClauses = [
  where(`contracts.close_time > now()`),
  where(`contracts.outcome_type != 'STONK'`),
  where(`contracts.outcome_type != 'BOUNTIED_QUESTION'`),
  where(`(contracts.data->>'marketTier') != 'play'`), // filtering by liquidity takes too long
  where(`contracts.visibility = 'public'`),
  where(`contracts.unique_bettor_count > 1`),
]

const contractsMeetingMinimumBar = renderSql(
  select('1'),
  from('contracts'),
  where('group_contracts.contract_id = contracts.id'),
  where(`coalesce(contracts.data->'isRanked', 'true')::boolean = true`),
  ...minimumContractsQualityBarWhereClauses
)

export const minimumTopicsQualityBarClauses = [
  select('distinct id, importance_score as topic_score'),
  from('groups'),
  join('group_contracts on group_contracts.group_id = groups.id'),
  where(`exists (${contractsMeetingMinimumBar})`),
  where(`groups.slug not in ($1:list)`, [GROUP_SLUGS_TO_NOT_INTRODUCE_IN_FEED]),
  order(`topic_score desc`),
]

const refreshActiveTopics = async (pg: SupabaseDirectClient) => {
  await pg.map(renderSql(minimumTopicsQualityBarClauses), [], (r) => {
    activeTopics[r.id] = r.topic_score
  })
}
