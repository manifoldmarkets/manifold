import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  decideFollowCreatorPrompt,
  FollowCreatorPromptMarketNotFound,
} from 'shared/follow-creator-prompt'
import {
  buildUserInterestsCache,
  userIdsToAverageTopicConversionScores,
} from 'shared/topic-interests'

// Web calls this after a trade fills, once it can show the prompt. It answers
// whether to suggest following the market's creator now and, if so, records
// the prompt (shared/follow-creator-prompt.ts).
export const followCreatorPrompt: APIHandler<'follow-creator-prompt'> = async (
  { contractId },
  auth
) => {
  const pg = createSupabaseDirectClient()
  try {
    return await decideFollowCreatorPrompt(pg, {
      userId: auth.uid,
      contractId,
      hasTopicInterests,
    })
  } catch (error) {
    if (error instanceof FollowCreatorPromptMarketNotFound)
      throw new APIError(404, 'Market not found')
    throw error
  }
}

// Same test getForYouSQL uses to choose its personalized ranking (which has
// the follow boost) over basicSearchSQL (which has none).
const hasTopicInterests = async (userId: string) => {
  if (
    !Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length
  ) {
    await buildUserInterestsCache([userId])
  }
  return (
    Object.keys(userIdsToAverageTopicConversionScores[userId] ?? {}).length > 0
  )
}
