import { APIError, authEndpoint, endpoint, validate } from 'api/helpers'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { QUEST_TYPES } from 'common/quest'
import { completeQuestInternal } from 'shared/quest'

const bodySchema = z.object({
  questType: z.enum(QUEST_TYPES),
})

export const completequest = authEndpoint(async (req, auth) => {
  const { questType } = validate(bodySchema, req.body)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(400, 'User not found')
  return await completeQuestInternal(user, questType)
})
