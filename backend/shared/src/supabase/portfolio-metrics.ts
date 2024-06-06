import { millisToTs } from 'common/supabase/utils'
import { SupabaseDirectClient } from './init'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'

export async function getPortfolioHistory(
  userId: string,
  start: number,
  limit: number,
  pg: SupabaseDirectClient
) {
  return pg.map(
    `select ts, investment_value, total_deposits, balance, loan_total, spice_balance
    from user_portfolio_history
    where user_id = $1 
    and ts > $2
    order by ts
    limit $3
    `,
    [userId, millisToTs(start), limit],
    convertPortfolioHistory
  )
}
