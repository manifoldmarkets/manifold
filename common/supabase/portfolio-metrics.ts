import { run, selectFrom, SupabaseClient } from './utils'
import { sortBy } from 'lodash'

export async function getPortfolioHistory(
  userId: string,
  cutoff: number,
  db: SupabaseClient
) {
  const { data } = await run(
    selectFrom(
      db,
      'user_portfolio_history',
      'timestamp',
      'investmentValue',
      'totalDeposits',
      'balance'
    )
      .eq('user_id', userId)
      .gt('data->>timestamp', cutoff)
  )
  return sortBy(data, 'timestamp')
}
