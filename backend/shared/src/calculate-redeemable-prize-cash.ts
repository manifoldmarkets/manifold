import { APIError } from 'common/api/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  groupBy,
  join,
  renderSql,
  select,
  where,
  withClause,
} from './supabase/sql-builder'
import { log } from './utils'

// Gets the total amount of sweepcash that a user can redeem for usd, before fees
export async function calculateRedeemablePrizeCash(
  pg: SupabaseDirectClient,
  userId: string
) {
  const result = await pg.oneOrNone<{
    moral_total: number
    total: number
    cash_balance: number
  }>(redeemableQuery(userId))

  if (result == null) {
    throw new APIError(401, 'Account not found')
  }
  log('Cashoutable sweepcash for', userId, result)
  return {
    morallyRedeemable: result.moral_total || 0,
    redeemable: result.total || 0,
    cashBalance: result.cash_balance || 0,
  }
}

export async function calculateTotalRedeemablePrizeCash(
  pg: SupabaseDirectClient
) {
  const result = await pg.one<{ moral_total: number; total: number }>(
    redeemableQuery()
  )
  console.log('result', result)

  return result.total
}

// Core query builder that works for both single user and all users
const redeemableQuery = (userId?: string) => {
  const cash_txns = renderSql(
    select(
      `case
        when category = 'CONTRACT_RESOLUTION_PAYOUT' then to_id
        else from_id
      end as user_id`
    ),
    select('amount'),
    select('category'),
    from('txns'),
    userId && where(`to_id = $1 or from_id = $1`, userId),
    where(`token = 'CASH'`),
    where(`category in ($1:csv)`, [
      [
        'CONTRACT_RESOLUTION_PAYOUT',
        'CONTRACT_UNDO_RESOLUTION_PAYOUT',
        'CASH_OUT',
        'CONVERT_CASH',
        'CHARITY',
      ],
    ])
  )

  const user_info = renderSql(
    select('id'),
    select('cash_balance'),
    select(
      `coalesce((data->'sweepstakes5kLimit')::boolean, false) as five_k_limit`
    ),
    from('users'),
    userId
      ? where(`id = $1`, userId)
      : where(`id in (select distinct user_id from cash_txns)`)
  )

  const txn_sums = renderSql(
    select(
      `sum(case
        when category = 'CONTRACT_RESOLUTION_PAYOUT' then (
          case when five_k_limit then least(amount, 5000) else amount end
        )
        when category = 'CONTRACT_UNDO_RESOLUTION_PAYOUT' then (
          case when five_k_limit then -least(amount, 5000) else -amount end
        )
        else -amount
      end) as txn_sum`
    ),
    select(`user_id`),
    from('cash_txns'),
    join('user_info on user_info.id = cash_txns.user_id'),
    groupBy(`user_id, five_k_limit`)
  )

  return renderSql(
    withClause(`cash_txns as (${cash_txns})`),
    withClause(`user_info as (${user_info})`),
    withClause(`txn_sums as (${txn_sums})`),
    select('sum(txn_sum) as moral_total'),
    select(
      `sum(
        greatest(0, least(cash_balance, txn_sum))
      ) as total`
    ),
    userId && select(`sum(cash_balance) as cash_balance`), // sum is arbitrary here
    from('user_info'),
    join('txn_sums on txn_sums.user_id = user_info.id')
  )
}
