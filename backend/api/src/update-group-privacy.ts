import * as admin from 'firebase-admin'
import { z } from 'zod'
import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'
import { createSupabaseClient } from 'shared/supabase/init'

const bodySchema = z.object({
  groupId: z.string(),
  privacy: z.enum(['public', 'curated', 'private']),
})

export const updategroupprivacy = authEndpoint(async (req, auth) => {
  const { groupId, privacy } = validate(bodySchema, req.body)

  // TODO: move to single supabase transaction
  const db = createSupabaseClient()

  const userMembership = (
    await db
      .from('group_members')
      .select()
      .eq('member_id', auth.uid)
      .eq('group_id', groupId)
      .limit(1)
  ).data

  const requester = userMembership?.length ? userMembership[0] : null

  const groupQuery = await db.from('groups').select().eq('id', groupId).limit(1)

  if (groupQuery.error) throw new APIError(500, groupQuery.error.message)
  if (!groupQuery.data.length) throw new APIError(404, 'Group cannot be found')
  if (!userMembership?.length)
    throw new APIError(404, 'You cannot be found in group')

  const group = groupQuery.data[0]

  if (requester?.role !== 'admin' && !isAdminId(auth.uid))
    throw new APIError(
      403,
      'You do not have permission to change group privacy'
    )

  if (group.privacy_status == 'private')
    throw new APIError(403, 'Private groups must remain private')

  if (privacy == 'private') {
    throw new APIError(403, 'You can not retroactively make a group private')
  }

  if (privacy == group.privacy_status) {
    throw new APIError(403, 'Group privacy is already set to this!')
  }

  await db
    .from('groups')
    .update({ privacy_status: privacy })
    .eq('id', groupId)
    .returns()

  return { status: 'success', message: 'Group privacy updated' }
})
