import { z } from 'zod'
import { authEndpoint, validate } from './helpers/endpoint'
import { addUserToTopic } from 'shared/supabase/groups'

const bodySchema = z
  .object({
    groupId: z.string(),
    userId: z.string(),
  })
  .strict()

export const addgroupmember = authEndpoint(async (req, auth) => {
  const { groupId, userId } = validate(bodySchema, req.body)
  return addUserToTopic(groupId, userId, auth.uid)
})
