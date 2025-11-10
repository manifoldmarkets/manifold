import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { isAdminId } from 'common/envs/constants'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { log } from 'shared/utils'
import { z } from 'zod'

const bodySchema = z
  .object({
    userId: z.string(),
    unban: z.boolean().optional(),
    unbanTime: z.number().optional(),
  })
  .strict()

export const banuser = authEndpoint(async (req, auth) => {
  const { userId, unban, unbanTime } = validate(bodySchema, req.body)
  const db = createSupabaseDirectClient()
  throwErrorIfNotMod(auth.uid)
  if (isAdminId(userId)) throw new APIError(403, 'Cannot ban admin')
  await trackPublicEvent(auth.uid, 'ban user', {
    userId,
  })

  if (unban) {
    // Manual unban: clear both ban flag and unban_time
    await updateUser(db, userId, {
      isBannedFromPosting: false,
    })
    await db.none(`update users set unban_time = null where id = $1`, [userId])
  } else {
    // Banning user
    await updateUser(db, userId, {
      isBannedFromPosting: true,
    })
    // Set unban_time if provided (temporary ban)
    if (unbanTime) {
      await db.none(`update users set unban_time = $1 where id = $2`, [
        new Date(unbanTime).toISOString(),
        userId,
      ])
    }
  }

  log('updated user')
  return { success: true }
})
