import { APIError, authEndpoint, validate } from 'api/helpers'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { completeCalculatedQuest } from 'shared/complete-quest-internal'

const bodySchema = z.object({
  questType: z.enum(['SHARES'] as const),
})

export const completequest = authEndpoint(async (req, auth) => {
  const { questType } = validate(bodySchema, req.body)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(401, 'Your account was not found')
  return await completeCalculatedQuest(user, questType)
})
