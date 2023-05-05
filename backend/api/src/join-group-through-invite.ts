import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { GroupInvite } from 'common/src/group-invite'

const schema = z.object({
  inviteId: z.string(),
})

// TODO: add the actual joining group logic here once we move off firebase
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
  if (now >= invite.expire_time) {
    throw new APIError(404, 'This link has expired')
  }
  if (invite.is_max_uses_reached) {
    throw new APIError(404, 'The max uses has been reached for this link')
  }
  log('joining group through invite')
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
  // return something
  return { status: 'success' }
})
