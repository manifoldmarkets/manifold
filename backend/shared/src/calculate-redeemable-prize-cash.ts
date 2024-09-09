import { SupabaseDirectClient } from 'shared/supabase/init'

// Gets the total amount of prize cash that a user can redeem for usd, before fees
// You still have to Math.min with user cash balance btw
export async function calculateRedeemablePrizeCash(
  userId: string,
  pg: SupabaseDirectClient
) {
  // TODO: add cash out cancels
  const result = await pg.oneOrNone<{ total: number }>(
    `select sum(
      case
        when t.category = 'CONTRACT_RESOLUTION_PAYOUT' then (
          case 
              when (t.data->>'isCashout5kLimit')::boolean then least(t.amount, 5000)
              else t.amount
          end
        )
        when t.category = 'CASH_OUT' then -t.amount
        else 0
      end
    ) as total
    from txns t
    left join txns cancels on t.id = cancels.data->'data'->>'revertsTxnId' and 
                              cancels.category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT'
    where t.token = 'CASH'
    and cancels.id is null
    and (t.to_id = $1 or t.from_id = $1)
    and (
      t.category = 'CASH_OUT' or
      t.category = 'CONTRACT_RESOLUTION_PAYOUT'
    )`,
    [userId]
  )
  const total = result?.total ?? 0
  return total > 0 ? total : 0
}
