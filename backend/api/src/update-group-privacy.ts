import { z } from 'zod'
import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateData } from 'shared/supabase/utils'

const bodySchema = z
  .object({
    groupId: z.string(),
    privacy: z.enum(['public', 'curated']),
  })
  .strict()

export const updategroupprivacy = authEndpoint(async (req, auth) => {
  const { groupId, privacy } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()

  const requester = await pg.oneOrNone(
    `select * from group_members where member_id = $1 and group_id = $2`,
    [auth.uid, groupId]
  )

  const group = await pg.oneOrNone(`select * from groups where id = $1`, [
    groupId,
  ])

  if (!group) throw new APIError(404, 'Group cannot be found')

  if (requester?.role !== 'admin' && !isAdminId(auth.uid))
    throw new APIError(
      403,
      'You do not have permission to change group privacy'
    )

  if (privacy == group.privacy_status) {
    throw new APIError(403, 'Group privacy is already set to this!')
  }

  await updateData(pg, 'groups', 'id', {
    privacyStatus: privacy,
  })

  return { status: 'success', message: 'Group privacy updated' }
})
