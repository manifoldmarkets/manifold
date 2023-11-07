import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import { addUserToGroup } from 'shared/supabase/groups'

const bodySchema = z
  .object({
    groupId: z.string(),
  })
  .strict()

export const joingroup = authEndpoint(async (req, auth) => {
  const { groupId } = validate(bodySchema, req.body)

  return addUserToGroup(groupId, auth.uid, auth.uid)
})
