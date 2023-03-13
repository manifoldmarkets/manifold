import { run, selectFrom, SupabaseClient } from './utils'
import { sortBy } from 'lodash'

export async function getPortfolioHistory(
  userId: string,
  start: number,
  db: SupabaseClient,
  end?: number
) {
  let query = selectFrom(
    db,
    'user_portfolio_history',
    'timestamp',
    'investmentValue',
    'totalDeposits',
    'balance'
  )
    .eq('user_id', userId)
    .gt('data->>timestamp', start)
  if (end) {
    query = query.lt('data->>timestamp', end)
  }
  const { data } = await run(query)
  return sortBy(data, 'timestamp')
}
