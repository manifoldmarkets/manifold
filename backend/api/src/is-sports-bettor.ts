import { buildUserInterestsCache } from 'shared/topic-interests'
import { userIdsToAverageTopicConversionScores } from 'shared/topic-interests'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { NEW_USER_FOLLOWED_TOPIC_SCORE_BOOST } from 'common/feed'
import { log } from 'shared/utils'

const sportsGroupId = '2hGlgVhIyvVaFyQAREPi'
const sportsGroupIds = [sportsGroupId]

export const isSportsInterested: APIHandler<'is-sports-interested'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  if (sportsGroupIds.length === 1) {
    const ids = await pg.map(
      `select bottom_id from group_groups where top_id = $1`,
      [sportsGroupId],
      (r) => r.bottom_id as string
    )
    sportsGroupIds.push(...ids)
  }
  const userId = auth.uid
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache([userId])
  }
  // Still no topic interests, return default search
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    log('No topic interests, returning true')
    return { isSportsInterested: true }
  }
  const isInterestedInSports = sportsGroupIds.some(
    (id) =>
      userIdsToAverageTopicConversionScores[userId]?.[id] >=
      NEW_USER_FOLLOWED_TOPIC_SCORE_BOOST
  )
  return { isSportsInterested: isInterestedInSports ?? false }
}
