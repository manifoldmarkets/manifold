import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export const dismissmodalert: APIHandler<'dismiss-mod-alert'> = async (
  { alertId },
  auth
) => {
  const pg = createSupabaseDirectClient()

  let result
  if (alertId !== undefined) {
    // Dismiss a specific alert (must belong to the user)
    // ended_at IS NULL check ensures we only dismiss active alerts:
    // - Alerts with ended_at set were already lifted by a mod
    // - Prevents overwriting mod's ended_at timestamp with user's dismiss time
    result = await pg.result(
      `UPDATE user_bans
       SET ended_by = $1, ended_at = now()
       WHERE id = $2
         AND user_id = $1
         AND ban_type = 'modAlert'
         AND ended_at IS NULL`,
      [auth.uid, alertId]
    )
  } else {
    // Dismiss all active mod alerts for this user (backwards compatible)
    result = await pg.result(
      `UPDATE user_bans
       SET ended_by = $1, ended_at = now()
       WHERE user_id = $1
         AND ban_type = 'modAlert'
         AND ended_at IS NULL`,
      [auth.uid]
    )
  }

  if (result.rowCount === 0) {
    throw new APIError(400, 'No mod alert to dismiss')
  }

  log('dismissed mod alert', auth.uid, { alertId, count: result.rowCount })
  return { success: true }
}
