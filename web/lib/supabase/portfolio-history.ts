import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { PortfolioMetrics } from 'common/user'

export async function getPortfolioHistory(userId: string, cutoff: number) {
  const { data } = await run(
    db
      .from('user_portfolio_history')
      .select(
        'data->timestamp, data->investmentValue, data->totalDeposits, data->balance'
      )
      .eq('user_id', userId)
      .gt('data->>timestamp', cutoff)
  )
  return data as PortfolioMetrics[]
}
