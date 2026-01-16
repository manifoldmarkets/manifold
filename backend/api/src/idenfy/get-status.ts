import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getIdenfyStatus: APIHandler<'get-idenfy-status'> = async (
  _props,
  auth
) => {
  const pg = createSupabaseDirectClient()

  // Get the latest verification status for this user
  const verification = await pg.oneOrNone<{
    status: string
    updated_time: Date
  }>(
    `SELECT status, updated_time
     FROM idenfy_verifications
     WHERE user_id = $1
     ORDER BY created_time DESC
     LIMIT 1`,
    [auth.uid]
  )

  if (!verification) {
    return {
      status: null,
      verifiedTime: null,
    }
  }

  return {
    status: verification.status as
      | 'pending'
      | 'approved'
      | 'denied'
      | 'suspected',
    verifiedTime:
      verification.status === 'approved'
        ? verification.updated_time.getTime()
        : null,
  }
}
