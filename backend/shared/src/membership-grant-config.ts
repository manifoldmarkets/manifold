import type { SupabaseDirectClient, SupabaseTransaction } from './supabase/init'

export const membershipGrantToken = 'MEMBERSHIP_GRANTS'

export async function membershipGrantStartsDisabled(pg: SupabaseDirectClient) {
  const row = await pg.oneOrNone<{ status: boolean }>(
    'select status from system_trading_status where token = $1',
    [membershipGrantToken]
  )
  return row?.status === false
}

export async function canStartMembershipGrant(tx: SupabaseTransaction) {
  // A rollback upsert must wait for starters even when the switch was missing.
  await tx.none(
    `insert into system_trading_status (token, status) values ($1, true)
     on conflict (token) do nothing`,
    [membershipGrantToken]
  )
  const { status } = await tx.one<{ status: boolean }>(
    'select status from system_trading_status where token = $1 for share',
    [membershipGrantToken]
  )
  return status
}
