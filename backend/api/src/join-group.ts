import { z } from 'zod'

import { addUserToGroup } from './add-group-member'
import { authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  groupId: z.string(),
})

export const joingroup = authEndpoint(async (req, auth) => {
  const { groupId } = validate(bodySchema, req.body)

  return addUserToGroup(groupId, auth.uid, auth.uid)
})
