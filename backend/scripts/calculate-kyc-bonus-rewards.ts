import { runScript } from './run-script'
import { type SupabaseDirectClient } from 'shared/supabase/init'
import { bulkUpsert } from 'shared/supabase/utils'

const TIMESTAMP = '2024-09-17 09:50:00-07'

async function calculateKycBonusRewards(pg: SupabaseDirectClient) {
  const allBalances = await pg.manyOrNone<{
    user_id: string
    reward_amount: number
  }>(
    `with last_entries as (
      select
        user_id,
        uph.investment_value,
        uph.balance,
        uph.spice_balance,
        uph.loan_total,
        uph.ts
      from
      users u left join lateral (
        select * from user_portfolio_history
        where user_id = u.id
        and ts <= $1
        order by ts desc
        limit 1
      ) uph on true
    )
    select
      user_id,
      (investment_value + balance + spice_balance) / 1000 as reward_amount
    from last_entries`,
    [TIMESTAMP]
  )

  const balances = allBalances.filter(({ reward_amount }) => reward_amount > 0)

  await bulkUpsert(pg, 'kyc_bonus_rewards', 'user_id', balances)
}

runScript(async ({ pg }) => {
  await calculateKycBonusRewards(pg)
})
