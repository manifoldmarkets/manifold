import { runScript } from './run-script'
import { type SupabaseDirectClient } from 'shared/supabase/init'
import { bulkUpsert } from 'shared/supabase/utils'

const TIMESTAMP = '2023-08-26 09:00:00'

async function calculateKycBonusRewards(pg: SupabaseDirectClient) {
  const allBalances = await pg.manyOrNone<{
    user_id: string
    reward_amount: number
  }>(
    `with last_entries as (
      select distinct on (user_id)
        user_id,
        investment_value,
        balance,
        spice_balance,
        loan_total,
        ts
      from user_portfolio_history
      where ts <= $1
      order by user_id, ts desc
    )
    select
      user_id,
      (investment_value + balance + spice_balance - loan_total) / 1000 as reward_amount
    from last_entries`,
    [TIMESTAMP]
  )

  const balances = allBalances.filter(({ reward_amount }) => reward_amount > 0)

  await bulkUpsert(pg, 'kyc_bonus_rewards', 'user_id', balances)
}

runScript(async ({ pg }) => {
  await calculateKycBonusRewards(pg)
})
