import { log } from 'shared/monitoring/log'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { chunk } from 'lodash'

export const userIdsToAverageTopicConversionScores: {
  [userId: string]: { [groupId: string]: number }
} = {}
export const buildUserInterestsCache = async (userIds: string[]) => {
  log('Starting user topic interests cache build process')
  const pg = createSupabaseDirectClient()
  if (userIds.every((uid) => userIdsToAverageTopicConversionScores[uid])) {
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
              select * from get_user_topic_interests_1($1, 50)
              where avg_conversion_score > 1
              order by avg_conversion_score desc limit 150
            ),
            top_disinterests as (
              select * from get_user_topic_interests_1($1, 50)
              where avg_conversion_score < 1
              order by avg_conversion_score limit 150
            )
            select group_id, avg_conversion_score from top_interests
            union all
            select group_id, avg_conversion_score from top_disinterests
          `,
            [userId],
            (r) => {
              userIdsToAverageTopicConversionScores[userId][r.group_id] =
                r.avg_conversion_score
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
              hasFewInterests ? 2 : 1.25
          } else {
            userIdsToAverageTopicConversionScores[userId][groupId] +=
              hasFewInterests ? 0.5 : 0.25
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
