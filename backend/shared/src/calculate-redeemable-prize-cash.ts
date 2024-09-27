import { SupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { log } from './utils'

// Gets the total amount of prize cash that a user can redeem for usd, before fees
// You still have to Math.min with user cash balance btw
export async function calculateRedeemablePrizeCash(
  pg: SupabaseDirectClient,
  userId: string
) {
  // TODO: add cash out cancels
  const result = await pg.oneOrNone<{ total: number; cash_balance: number }>(
    `with user_info as (
      select cash_balance, coalesce((data->'sweepstakes5kLimit')::boolean, false) as five_k_limit
      from users
      where id = $1
    ),
    redeemable as (
      select sum(case
        when category = 'CONTRACT_RESOLUTION_PAYOUT' then (
          case when (select five_k_limit from user_info) then least(amount, 5000) else amount end
        )
        when category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT' then (
          case when (select five_k_limit from user_info) then -least(amount, 5000) else -amount end
        )
        else -amount
      end) as total
      from txns
      where token = 'CASH'
      and (to_id = $1 or from_id = $1)
      and category in (
        'CONTRACT_RESOLUTION_PAYOUT',
        'CONTRACT_UNDO_RESOLUTION_PAYOUT',
        'CASH_OUT',
        'CONVERT_CASH',
        'CHARITY'
      )
    )
    select user_info.cash_balance, redeemable.total
    from user_info, redeemable`,
    [userId]
  )

  if (result == null) {
    throw new APIError(401, 'Account not found')
  }
  log('Cashoutable sweepcash for', userId, result)

  return {
    redeemable: Math.min(result.total, result.cash_balance),
    cashBalance: result.cash_balance,
  }
}
