import { z } from 'zod'
import { authEndpoint, validate } from './helpers'
import { addUserToTopic } from 'shared/supabase/groups'

const bodySchema = z
  .object({
    groupId: z.string(),
    userId: z.string(),
    role: z.string().optional(),
  })
  .strict()

export const addgroupmember = authEndpoint(async (req, auth) => {
  const { groupId, userId, role } = validate(bodySchema, req.body)
  return addUserToTopic(groupId, userId, auth.uid, role)
})
