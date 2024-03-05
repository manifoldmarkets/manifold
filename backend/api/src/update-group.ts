import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { isAdminId } from 'common/envs/constants'
import { contentSchema } from 'common/api/zod-types'
import { MAX_ABOUT_LENGTH, MAX_GROUP_NAME_LENGTH } from 'common/group'

const schema = z
  .object({
    id: z.string(),
    about: contentSchema.or(z.string().max(MAX_ABOUT_LENGTH)).optional(),
    name: z.string().min(2).max(MAX_GROUP_NAME_LENGTH).optional(),
    bannerUrl: z.string().optional(),
  })
  .strict()

export const updategroup = authEndpoint(async (req, auth) => {
  const data = validate(schema, req.body)
  const db = createSupabaseDirectClient()

  const requester = await db.oneOrNone(
    'select role from group_members where group_id = $1 and member_id = $2',
    [data.id, auth.uid]
  )

  if (requester?.role !== 'admin' && !isAdminId(auth.uid)) {
    throw new APIError(403, 'You do not have permission to update this group')
  }

  if (data.name) {
    const existingName = await db.oneOrNone(
      `select 1 from groups where name = $1`,
      [data.name]
    )
    if (existingName) {
      throw new APIError(400, `The group ${data.name} already exists`)
    }
  }

  await updateData(db, 'groups', 'id', data)
  return { status: 'success' }
})
