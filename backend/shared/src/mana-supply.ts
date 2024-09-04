import { createSupabaseDirectClient } from 'shared/supabase/init'
import { chunk } from 'lodash'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { log } from 'shared/utils'

export const getManaSupply = async (recalculateAllUserPortfolios: boolean) => {
  const pg = createSupabaseDirectClient()
  if (recalculateAllUserPortfolios) {
    const allUserIdsWithInvestments = await pg.map(
      `
          select distinct u.id from users u
           join user_contract_metrics ucm on u.id = ucm.user_id
           join contracts c on ucm.contract_id = c.id
          where u.data->'lastBetTime' is not null
          and c.resolution_time is null;
      `,
      [],
      (r) => r.id as string
    )
    const chunks = chunk(allUserIdsWithInvestments, 1000)
    let processed = 0
    for (const userIds of chunks) {
      await updateUserMetricsCore(userIds)
      processed += userIds.length
      log(`Processed ${processed} of ${allUserIdsWithInvestments.length} users`)
    }
  }
  const userPortfolio = await pg.one(
    `select
      sum(u.balance + u.spice_balance + coalesce(uphl.investment_value, 0)) as total_mana_value,
      sum(u.cash_balance + coalesce(uphl.cash_investment_value, 0)) as total_cash_value,
      sum(u.balance) as mana_balance,
      sum(u.spice_balance) as spice_balance,
      sum(u.cash_balance) as cash_balance,
      sum(coalesce(uphl.investment_value, 0)) as mana_investment_value,
      sum(coalesce(uphl.cash_investment_value, 0)) as cash_investment_value,
      sum(coalesce(uphl.loan_total, 0)) as loan_total
    from users u
    left join user_portfolio_history_latest uphl on u.id = uphl.user_id
    where (u.balance + u.spice_balance + coalesce(uphl.investment_value, 0)) > 0.0`,
    [],
    (r: any) => ({
      totalManaValue: Number(r.total_mana_value),
      totalCashValue: Number(r.total_cash_value),
      manaBalance: Number(r.mana_balance),
      spiceBalance: Number(r.spice_balance),
      cashBalance: Number(r.cash_balance),
      manaInvestmentValue: Number(r.mana_investment_value),
      cashInvestmentValue: Number(r.cash_investment_value),
      loanTotal: Number(r.loan_total),
    })
  )

  const liquidity = await getAMMLiquidity()

  const totalManaValue = userPortfolio.totalManaValue + liquidity.mana
  const totalCashValue = userPortfolio.totalCashValue + liquidity.cash
  return {
    ...userPortfolio,
    ammManaLiquidity: liquidity.mana,
    ammCashLiquidity: liquidity.cash,
    totalManaValue,
    totalCashValue,
  }
}

const getAMMLiquidity = async () => {
  const pg = createSupabaseDirectClient()
  const [binaryLiquidity, multiLiquidity] = await Promise.all([
    pg.many<{ sum: number; token: 'MANA' | 'CASH' }>(
      `select sum((data->>'prob')::numeric * (data->'pool'->>'YES')::numeric + (1-(data->>'prob')::numeric) *(data->'pool'->>'NO')::numeric + (data->'subsidyPool')::numeric)
      from contracts
      where resolution is null and mechanism = 'cpmm-1'
      group by token`,
      []
    ),
    pg.many<{ sum: number; token: 'MANA' | 'CASH' }>(
      `select sum(prob * pool_yes + (1-prob) * pool_no + subsidy_pool) from answers
        join contracts on contract_id = contracts.id
        where contracts.resolution is null
        group by contracts.token`,
      []
    ),
  ])

  return {
    mana:
      (binaryLiquidity.find((l) => l.token === 'MANA')?.sum || 0) +
      (multiLiquidity.find((l) => l.token === 'MANA')?.sum || 0),
    cash:
      (binaryLiquidity.find((l) => l.token === 'CASH')?.sum || 0) +
      (multiLiquidity.find((l) => l.token === 'CASH')?.sum || 0),
  }
}
