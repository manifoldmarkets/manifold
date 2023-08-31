import { SupabaseDirectClient } from 'shared/supabase/init'

export const hasUserSeenMarket = async (
  marketId: string,
  userId: string,
  since: number,
  pg: SupabaseDirectClient
) => {
  return await pg.oneOrNone(
    `
    select exists (
      select 1 from user_seen_markets
      where contract_id = $1
      and user_id = $2
      and created_time > millis_to_ts($3))
    `,
    [marketId, userId, since],
    (row) => row.exists as boolean
  )
}
