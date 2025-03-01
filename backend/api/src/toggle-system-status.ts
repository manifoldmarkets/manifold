import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'

export const toggleSystemTradingStatus: APIHandler<
  'toggle-system-trading-status'
> = async ({ token }, auth) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can toggle system status')
  }

  const pg = createSupabaseDirectClient()
  const result = await pg.one(
    `UPDATE system_trading_status SET status = NOT status WHERE token = $1 RETURNING status`,
    [token]
  )

  return { status: result.status as boolean }
}
