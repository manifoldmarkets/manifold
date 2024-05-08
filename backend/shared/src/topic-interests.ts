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
  const activeUserIds = filterDefined([userId])

  if (Object.keys(userIdsToAverageTopicConversionScores).length === 0) {
    const recentlyActiveUserIds = await pg.map(
      `select distinct user_id from user_contract_interactions
              where created_time > now() - interval $1`,
      [timeFrame],
      (r) => r.user_id as string
    )
    activeUserIds.push(...recentlyActiveUserIds)
  } else if (userId && userIdsToAverageTopicConversionScores[userId]) {
    return
  }
  log('building cache for users: ', activeUserIds.length)
  const chunks = chunk(activeUserIds, 1000)
  for (const userIds of chunks) {
    await Promise.all([
      ...userIds.map(async (userId) => {
        userIdsToAverageTopicConversionScores[userId] = {}
        await pg.map(
          `SELECT * FROM get_user_topic_interests_1($1, 50) LIMIT 200`,
          [userId],
          (r) => {
            userIdsToAverageTopicConversionScores[userId][r.group_id] =
              r.avg_conversion_score
          }
        )
      }),
      addScoreForFollowedTopics(pg, userIds),
    ])
    log(
      'built topic interests cache for users: ',
      Object.keys(userIdsToAverageTopicConversionScores).length
    )
  }
  log('built user topic interests cache')
}

const addScoreForFollowedTopics = async (
  pg: SupabaseDirectClient,
  userIds: string[]
) => {
  await pg.map(
    `select member_id, group_id from group_members where member_id = any($1)`,
    [userIds],
    (row) => {
      if (!userIdsToAverageTopicConversionScores[row.member_id]) {
        userIdsToAverageTopicConversionScores[row.member_id] = {}
      }
      if (!userIdsToAverageTopicConversionScores[row.member_id][row.group_id]) {
        userIdsToAverageTopicConversionScores[row.member_id][row.group_id] = 0
      }
      userIdsToAverageTopicConversionScores[row.member_id][row.group_id] += 1
    }
  )
}
