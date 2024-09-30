import { isAdminId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  limit,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { updateData } from 'shared/supabase/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'

const bodySchema = z
  .object({
    groupId: z.string(),
    privacy: z.enum(['public', 'curated']),
  })
  .strict()

export const updategroupprivacy = authEndpoint(async (req, auth) => {
  const { groupId, privacy } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()
  await pg.tx(async (tx) => {
    const group = await tx.oneOrNone(
      `select * from groups where id = $1`,
      groupId
    )

    if (!group) throw new APIError(404, 'Group not found')

    const requester = await pg.oneOrNone(
      renderSql(
        from('group_members'),
        select('*'),
        where('member_id = $1', auth.uid),
        where('group_id= $1', groupId),
        limit(1)
      )
    )

    if (!requester?.length)
      throw new APIError(404, 'You cannot be found in group')

    if (group.privacy_status === privacy) {
      throw new Error('Group privacy is already set to this!')
    }

    console.log(group)

    if (requester?.role !== 'admin' && !isAdminId(auth.uid))
      throw new APIError(
        403,
        'You do not have permission to change group privacy'
      )

    if (privacy == group.privacy_status) {
      throw new APIError(403, 'Group privacy is already set to this!')
    }

    await updateData(tx, 'groups', 'id', {
      id: groupId,
      privacyStatus: privacy,
    })
  })

  return { status: 'success', message: 'Group privacy updated' }
})
