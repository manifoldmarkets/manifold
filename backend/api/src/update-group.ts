import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { isAdminId } from 'common/envs/constants'
import { contentSchema } from 'shared/zod-types'
import { MAX_ABOUT_LENGTH } from 'common/group'

const schema = z.object({
  id: z.string(),
  about: contentSchema.or(z.string().max(MAX_ABOUT_LENGTH)).optional(),
  bannerUrl: z.string().optional(),
})

export const updategroup = authEndpoint(async (req, auth) => {
  const { id, ...data } = validate(schema, req.body)
  const db = createSupabaseDirectClient()

  const requester = await db.oneOrNone(
    'select role from group_members where group_id = $1 and member_id = $2',
    [id, auth.uid]
  )

  if (requester?.role !== 'admin' && !isAdminId(auth.uid)) {
    throw new APIError(403, 'You do not have permission to update this group')
  }

  await updateData(db, 'groups', id, data)
  return { satus: 'success' }
})
