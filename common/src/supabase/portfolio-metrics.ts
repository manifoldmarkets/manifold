import { run, selectFrom, SupabaseClient } from './utils'
import { sortBy } from 'lodash'

export async function getPortfolioHistory(
  userId: string,
  start: number,
  db: SupabaseClient,
  end?: number
) {
  let query = db
    .from('user_portfolio_history')
    .select('ts, investment_value, total_deposits, balance')
    .eq('user_id', userId)
    .gt('ts', new Date(start).toISOString())
  if (end) {
    query = query.lt('ts', new Date(end).toISOString())
  }
  const { data } = await run(query)
  return sortBy(data, 'ts').map((d) => ({
    timestamp: Date.parse(d.ts!),
    investmentValue: d.investment_value!,
    totalDeposits: d.total_deposits!,
    balance: d.balance!,
  }))
}
