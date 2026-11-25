import type { SupabaseDirectClient } from './supabase/init'

export const membershipGrantToken = 'MEMBERSHIP_GRANTS'

export async function membershipGrantStartsDisabled(pg: SupabaseDirectClient) {
  const row = await pg.oneOrNone<{ status: boolean }>(
    // Switching off waits for transactions that can still start a grant.
    'select status from system_trading_status where token = $1 for share',
    [membershipGrantToken]
  )
  return row?.status === false
}
