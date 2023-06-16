import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { GroupInvite } from 'common/src/group-invite'
import { addGroupMemberHelper } from './add-group-member'

const schema = z.object({
  inviteId: z.string(),
})

// TODO: this whole thing should be a transaction
export const joingroupthroughinvite = authEndpoint(async (req, auth) => {
  const { inviteId } = validate(schema, req.body)
  const pg = createSupabaseDirectClient()
  const now = new Date()
  const invite: GroupInvite | null = await pg.oneOrNone(
    `select * from group_invites where id = $1`,
    [inviteId]
  )
  if (!invite) {
    throw new APIError(404, 'Group invite not found')
  }
  if (!invite.is_forever && invite.expire_time && now >= invite.expire_time) {
    throw new APIError(404, 'This link has expired')
  }
  if (invite.is_max_uses_reached) {
    throw new APIError(404, 'The max uses has been reached for this link')
  }
  const ret = await addGroupMemberHelper(invite.group_id, auth.uid, auth.uid)

  try {
    const result = await pg.result(
      `update group_invites set uses = $1 + 1 where id = $2`,
      [invite.uses, inviteId]
    )
    if (result.rowCount === 0) {
      throw new APIError(404, 'Group invite not found')
    }
  } catch (error) {
    throw new APIError(500, 'Failed to update group invite')
  }
  return ret
})
