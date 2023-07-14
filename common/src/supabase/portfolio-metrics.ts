import { run, millisToTs, tsToMillis, SupabaseClient } from './utils'

export async function getPortfolioHistory(
  userId: string,
  start: number,
  db: SupabaseClient,
  end?: number
) {
  let query = db
    .from('user_portfolio_history')
    .select('ts, investment_value, total_deposits, balance, loan_total')
    .eq('user_id', userId)
    .gt('ts', millisToTs(start))
  if (end) {
    query = query.lt('ts', new Date(end).toISOString())
  }
  query = query.order('ts', { ascending: false })

  const { data } = await run(query)
  return data.map(convertPortfolioHistory)
}

export async function getCurrentPortfolio(userId: string, db: SupabaseClient) {
  const query = db
    .from('user_portfolio_history')
    .select('ts, investment_value, total_deposits, balance, loan_total')
    .eq('user_id', userId)
    .order('ts', { ascending: false })
    .limit(1)

  const { data } = await run(query)
  const [d] = data
  if (!d) return null
  return convertPortfolioHistory(d)
}

export const convertPortfolioHistory = (row: any) => {
  return {
    // mqp: hack for temporary unwise choice of postgres timestamp without time zone type
    // -- we have to make it look like an ISO9601 date or the JS date constructor will
    // assume that it's in local time. will fix this up soon
    timestamp: tsToMillis(row.ts + '+0000'),
    investmentValue: +row.investment_value,
    totalDeposits: +row.total_deposits,
    balance: +row.balance,
    loanTotal: +row.loan_total,
  }
}
