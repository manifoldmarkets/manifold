import { run, millisToTs, tsToMillis, SupabaseClient } from './utils'
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
    .gt('ts', millisToTs(start))
  if (end) {
    query = query.lt('ts', new Date(end).toISOString())
  }
  const { data } = await run(query)
  return sortBy(data, 'ts').map((d) => {
    return {
      // mqp: hack for temporary unwise choice of postgres timestamp without time zone type
      // -- we have to make it look like an ISO9601 date or the JS date constructor will
      // assume that it's in local time. will fix this up soon
      timestamp: tsToMillis(d.ts! + '+0000'),
      investmentValue: +d.investment_value!,
      totalDeposits: +d.total_deposits!,
      balance: +d.balance!,
    }
  })
}

export async function getCurrentPortfolio(userId: string, db: SupabaseClient) {
  const query = db
    .from('user_portfolio_history')
    .select('ts, investment_value, total_deposits, balance')
    .eq('user_id', userId)
    .order('ts', { ascending: false })
    .limit(1)
  const { data } = await run(query)
  const [d] = data
  if (!d) return null
  return {
    // mqp: hack for temporary unwise choice of postgres timestamp without time zone type
    // -- we have to make it look like an ISO9601 date or the JS date constructor will
    // assume that it's in local time. will fix this up soon
    timestamp: tsToMillis(d.ts! + '+0000'),
    investmentValue: +d.investment_value!,
    totalDeposits: +d.total_deposits!,
    balance: +d.balance!,
  }
}
