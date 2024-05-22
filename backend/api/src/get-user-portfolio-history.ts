import { sortBy } from 'lodash'

import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getCutoff } from 'common/period'

export const getUserPortfolioHistory: APIHandler<
  'get-user-portfolio-history'
> = async (props) => {
  const pg = createSupabaseDirectClient()
  const { userId, period } = props

  const startDate = new Date(getCutoff(period)).toISOString()

  const data = await pg.map(
    `select ts, investment_value, total_deposits, balance, spice_balance, loan_total, profit
    from user_portfolio_history
    where
      user_id = $1
      and ts > $2
    order by random()
    limit 1000`,
    [userId, startDate],
    (r) => ({
      balance: Number(r.balance),
      spiceBalance: Number(r.spice_balance),
      investmentValue: Number(r.investment_value),
      loanTotal: Number(r.loan_total),
      totalDeposits: Number(r.total_deposits),
      timestamp: new Date(r.ts).getTime(),
      profit: r.profit ? Number(r.profit) : undefined,
    })
  )

  const sortedData = sortBy(data, 'timestamp')
  return sortedData
}
