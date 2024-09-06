import { SupabaseDirectClient } from 'shared/supabase/init'

// Gets the total amount of prize cash that a user can redeem for usd, before fees
// You still have to Math.min with user cash balance btw
export async function calculateRedeemablePrizeCash(
  userId: string,
  pg: SupabaseDirectClient
) {
  // TODO: add cash out cancels
  const result = await pg.oneOrNone<{ total: number }>(
    `with cancels as (
      select data->>'revertsTxnId' as txn_id
      from txns
      where token = 'CASH'
      and category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
    )
    select sum(case
      when category = 'CONTRACT_RESOLUTION_PAYOUT' then (
        case when (data->>'isCashout5kLimit')::boolean then least(amount, 5000)
        else amount
        end
      )
      when category = 'CASH_OUT' then -amount
      else 0
    end) as total
    from txns
    where token = 'CASH'
    and id not in (select txn_id from cancels)
    and (to_id = $1 or from_id = $1)
    and (
      category = 'CASH_OUT'
      or (
        category = 'CONTRACT_RESOLUTION_PAYOUT'
        and (data->'cashoutable')::boolean = true
      )
    )`,
    [userId]
  )
  const total = result?.total ?? 0
  return total > 0 ? total : 0
}
