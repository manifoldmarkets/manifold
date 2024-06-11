import { log } from 'shared/monitoring/log'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { chunk } from 'lodash'
import { FOLLOWED_TOPIC_CONVERSION_PRIOR } from 'common/feed'

export type TopicToInterestWeights = { [groupId: string]: number }
export const userIdsToAverageTopicConversionScores: {
  [userId: string]: TopicToInterestWeights
} = {}

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
  const chunks = chunk(userIds, 1000)
  for (const userIds of chunks) {
    await Promise.all([
      ...userIds.map(async (userId) => {
        userIdsToAverageTopicConversionScores[userId] = {}
        const [followedTopics, _] = await Promise.all([
          getFollowedTopics(pg, userId),
          pg.map(
            `
            with top_interests as (
              select * from get_user_topic_interests_2($1)
              order by score desc limit 300
            ),
            top_disinterests as (
              select * from get_user_topic_interests_2($1)
              order by score limit 150
            )
            select group_id, score from top_interests
            union all
            select group_id, score from top_disinterests
          `,
            [userId],
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
