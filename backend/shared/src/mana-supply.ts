import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getManaSupply = async () => {
  const pg = createSupabaseDirectClient()
  const userPortfolio = await pg.one(
    `select sum(balance + spice_balance + investment_value) as total_value,
      sum(balance)              as balance,
      sum(spice_balance)        as spice_balance,
      sum(investment_value)     as investment_value,
      sum(loan_total)           as loan_total
    from user_portfolio_history_latest
    where
      user_id not in ('pyBueUg9y3hrDIUtrus5uAkPHCr1', 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2', 'tRZZ6ihugZQLXPf6aPRneGpWLmz1', 'ttl8PytdL4P9oD0fNneqvwgOZhy1')
      and (balance + spice_balance + investment_value) > 0.0
  `,
    [],
    (r: any) => ({
      totalValue: Number(r.total_value),
      balance: Number(r.balance),
      spiceBalance: Number(r.spice_balance),
      investmentValue: Number(r.investment_value),
      loanTotal: Number(r.loan_total),
    })
  )

  const ammLiquidity = await getAMMLiquidity()

  const totalValue = userPortfolio.totalValue + ammLiquidity
  const totalUsdValue = totalValue / 100
  return {
    ...userPortfolio,
    ammLiquidity,
    totalValue,
    totalUsdValue,
  }
}

const getAMMLiquidity = async () => {
  const pg = createSupabaseDirectClient()
  const [binaryLiquidity, multiLiquidity] = await Promise.all([
    pg.one(
      `select sum((data->>'prob')::numeric * (data->'pool'->>'YES')::numeric + (1-(data->>'prob')::numeric) *(data->'pool'->>'NO')::numeric) from contracts
    where resolution is null
    and mechanism = 'cpmm-1'`,
      [],
      (r: any) => Number(r.sum)
    ),
    pg.one(
      `select sum(prob * pool_yes + (1-prob) * pool_no) from answers
        join contracts on contract_id = contracts.id
        where resolution is null`,
      [],
      (r: any) => Number(r.sum)
    ),
  ])

  return binaryLiquidity + multiLiquidity
}
