import { log } from 'shared/monitoring/log'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { filterDefined } from 'common/util/array'
import { chunk } from 'lodash'
import { DEBUG_TIME_FRAME, DEBUG_TOPIC_INTERESTS } from 'shared/init-caches'

export const userIdsToAverageTopicConversionScores: {
  [userId: string]: { [groupId: string]: number }
} = {}

export const buildUserInterestsCache = async (userId?: string) => {
  const timeFrame = DEBUG_TOPIC_INTERESTS ? DEBUG_TIME_FRAME : '3 month'
  log('Starting user topic interests cache build process')
  const pg = createSupabaseDirectClient()
  const userIdsToCacheInterests = filterDefined([userId])

  if (userId && userIdsToAverageTopicConversionScores[userId]) {
    return
  } else if (Object.keys(userIdsToAverageTopicConversionScores).length === 0) {
    const activeUserIdsToCacheInterests = await pg.map(
      `select distinct user_id from user_contract_interactions
              where created_time > now() - interval $1`,
      [timeFrame],
      (r) => r.user_id as string
    )
    userIdsToCacheInterests.push(...activeUserIdsToCacheInterests)
  }

  log('building cache for users: ', userIdsToCacheInterests.length)
  const chunks = chunk(userIdsToCacheInterests, 1000)
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
          const groupScore =
            userIdsToAverageTopicConversionScores[userId][groupId]
          if (groupScore === undefined) {
            userIdsToAverageTopicConversionScores[userId][groupId] = 1.25
          } else {
            userIdsToAverageTopicConversionScores[userId][groupId] += 0.25
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
