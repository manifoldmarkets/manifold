import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { chunk } from 'lodash'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { log } from 'shared/utils'
import { DAY_MS } from 'common/util/time'
import { millisToTs } from 'common/supabase/utils'

export const recalculateAllUserPortfolios = async (
  pg: SupabaseDirectClient
) => {
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

// note this is missing amm liquidity
export const getManaSupplyEachDayBetweeen = async (
  pg: SupabaseDirectClient,
  startDate: number,
  numberOfDays: number
) => {
  const results = []

  for (let day = 0; day < numberOfDays; day++) {
    const start = startDate + day * DAY_MS
    const end = start + DAY_MS

    // claude generated - takes advantage of users table being much smaller than user_portfolio_history
    const userPortfolio = await pg.one(
      `with last_history as (
        select uph.* from
        users u left join lateral (
          select *
          from user_portfolio_history
          where user_id = u.id and ts <= millis_to_ts($1)
          order by ts desc
          limit 1
        ) uph on true
      )
      select
        sum(balance) as mana_balance,
        sum(spice_balance) as spice_balance,
        sum(cash_balance) as cash_balance,
        sum(investment_value) as mana_investment_value,
        sum(cash_investment_value) as cash_investment_value,
        sum(loan_total) as loan_total
      from last_history
      where balance + spice_balance + investment_value > 0;
      `,
      [end],
      (r: any) => ({
        day: millisToTs(start),
        totalManaValue:
          Number(r.mana_balance) +
          Number(r.spice_balance) +
          Number(r.mana_investment_value),
        totalCashValue:
          Number(r.cash_balance) + Number(r.cash_investment_value),
        manaBalance: Number(r.mana_balance),
        spiceBalance: Number(r.spice_balance),
        cashBalance: Number(r.cash_balance),
        manaInvestmentValue: Number(r.mana_investment_value),
        cashInvestmentValue: Number(r.cash_investment_value),
        loanTotal: Number(r.loan_total),
      })
    )
    results.push(userPortfolio)
    console.log('fetched results for ', millisToTs(start))
  }
  return results
}

export const getManaSupply = async (pg: SupabaseDirectClient) => {
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
