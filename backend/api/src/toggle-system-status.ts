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
  // Use upsert pattern: insert with false (disabled) if not exists, or toggle if exists
  // This way, first toggle when row doesn't exist will disable the feature
  const result = await pg.one(
    `INSERT INTO system_trading_status (token, status)
     VALUES ($1, false)
     ON CONFLICT (token) DO UPDATE SET status = NOT system_trading_status.status
     RETURNING status`,
    [token]
  )

  return { status: result.status as boolean }
}
