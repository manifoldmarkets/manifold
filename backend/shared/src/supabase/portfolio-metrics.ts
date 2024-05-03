import { millisToTs } from 'common/supabase/utils'
import { SupabaseDirectClient } from './init'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'

// copied from getPortfolioHistory in common/supabase/portfolio-metrics.ts
export async function getPortfolioHistoryDirect(
  userId: string,
  start: number,
  db: SupabaseDirectClient
) {
  return db.map(
    `select ts, investment_value, total_deposits, balance, loan_total
    from user_portfolio_history
    where user_id = $1 
    and ts > $2
    order by ts asc`,
    [userId, millisToTs(start)],
    convertPortfolioHistory
  )
}
