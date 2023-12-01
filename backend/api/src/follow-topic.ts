import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import { addUserToTopic } from 'shared/supabase/groups'

const bodySchema = z
  .object({
    groupId: z.string(),
  })
  .strict()

export const followtopic = authEndpoint(async (req, auth) => {
  const { groupId } = validate(bodySchema, req.body)

  return addUserToTopic(groupId, auth.uid, auth.uid)
})
