import { APIError } from 'common/api/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  join,
  renderSql,
  select,
  where,
  withClause,
} from './supabase/sql-builder'
import { log } from './utils'

// Gets the total amount of prize cash that a user can redeem for usd, before fees
// You still have to Math.min with user cash balance btw
export async function calculateRedeemablePrizeCash(
  pg: SupabaseDirectClient,
  userId: string
) {
  const result = await pg.oneOrNone<{ total: number; cash_balance: number }>(
    redeemableQuery(userId)
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

export async function calculateTotalRedeemablePrizeCash(
  pg: SupabaseDirectClient
) {
  const result = await pg.one<{ total: number }>(redeemableQuery())
  console.log('result', result.total)

  return result.total || 0
}

const redeemableQuery = (userId?: string) => {
  const user_info = renderSql(
    select('id'),
    userId && select('cash_balance'),
    select(
      `coalesce((data->'sweepstakes5kLimit')::boolean, false) as five_k_limit`
    ),
    from('users'),
    userId && where('id = $1', userId)
  )

  // TODO: add cash out cancels

  const condition = userId
    ? `(select five_k_limit from user_info)`
    : `five_k_limit`

  const redeemable = renderSql(
    select(
      `sum(case
          when category = 'CONTRACT_RESOLUTION_PAYOUT' then (
            case when ${condition} then least(amount, 5000) else amount end
          )
          when category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT' then (
            case when ${condition} then -least(amount, 5000) else -amount end
          )
          else -amount
        end) as total`
    ),
    from('txns'),
    userId
      ? where(`to_id = $1 or from_id = $1`, userId)
      : join(
          'user_info on user_info.id = txns.to_id or user_info.id = txns.from_id'
        ),
    where(`token = 'CASH'`),
    where(`category in ($1:csv)`, [
      'CONTRACT_RESOLUTION_PAYOUT',
      'CONTRACT_UNDO_RESOLUTION_PAYOUT',
      'CASH_OUT',
      'CONVERT_CASH',
      'CHARITY',
    ])
  )

  const fullQuery = renderSql(
    withClause(`user_info as (${user_info})`),
    withClause(`redeemable as (${redeemable})`),
    userId && select(`cash_balance`),
    select(`total`),
    from(userId ? `redeemable, user_info` : `redeemable`)
  )

  return fullQuery
}
