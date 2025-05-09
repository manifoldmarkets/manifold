import { isAdminId, isModId } from 'common/envs/constants'
import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const dismissUserReport: APIHandler<'dismiss-user-report'> = async (
  props,
  auth
) => {
  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'Only admins can dismiss user reports.')
  }

  const { reportId } = props

  const db = createSupabaseDirectClient()

  try {
    await db.none(
      'UPDATE reports SET dismissed_by_user_id = $1 WHERE id = $2',
      [auth.uid, reportId]
    )
  } catch (err) {
    // Log the error and throw an APIError
    console.error(`Error dismissing report ${reportId}:`, err)
    if (err instanceof Error) {
      throw new APIError(500, `Failed to dismiss report: ${err.message}`)
    }
    throw new APIError(500, 'Failed to dismiss report due to an unknown error')
  }

  return { success: true }
}
