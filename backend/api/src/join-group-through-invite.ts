import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { GroupInvite } from 'common/src/group-invite'
import { joinGroupHelper } from './join-group'

const schema = z.object({
  inviteId: z.string(),
})

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
  const member = await joinGroupHelper(invite.group_id, true, auth)
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
  return { status: 'success', member }
})
