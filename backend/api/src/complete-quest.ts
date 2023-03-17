import { APIError, endpoint, validate } from 'api/helpers'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { QUEST_TYPES } from 'common/quest'
import { completeQuestInternal } from 'shared/quest'

const bodySchema = z.object({
  // must be of type QuestType
  questType: z.enum(QUEST_TYPES),
  userId: z.string(),
})

export const completequest = endpoint(async (req) => {
  const { questType, userId } = validate(bodySchema, req.body)

  const user = await getUser(userId)
  if (!user) throw new APIError(400, 'User not found')
  return await completeQuestInternal(user, questType)
})
