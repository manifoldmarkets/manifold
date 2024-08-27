import { SupabaseDirectClient } from 'shared/supabase/init'

// Gets the total amount of prize cash that a user can redeem for usd, before fees
// You still have to Math.min with user cash balance btw
export async function calculateRedeemablePrizeCash(
  userId: string,
  pg: SupabaseDirectClient
) {
  // TODO: add cash out cancels
  const result = await pg.oneOrNone<{ total: number }>(
    `select sum(case
      when category = 'CONTRACT_RESOLUTION_PAYOUT' then amount
      when category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT' then -amount
      when category = 'CASH_OUT' then -amount
      else 0
    end) as total
    from txns
    where token = 'CASH'
    and (to_id = $1 or from_id = $1)
    and category in ('CONTRACT_RESOLUTION_PAYOUT', 'CONTRACT_UNDO_RESOLUTION_PAYOUT', 'CASH_OUT')`,
    [userId]
  )
  const total = result?.total ?? 0
  return total > 0 ? total : 0
}
