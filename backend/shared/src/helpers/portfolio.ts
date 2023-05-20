import { tsToMillis } from 'common/supabase/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'

export const getCurrentPortfolio = async (
  pg: SupabaseDirectClient,
  userId: string
) => {
  const portfolio = await pg.oneOrNone<{
    investment_value: number
    balance: number
    total_deposits: number
    user_id: string
    ts: Date
  }>(
    `select * from user_portfolio_history
      where user_id = $1
      order by ts desc
      limit 1
    `,
    [userId]
  )
  if (!portfolio) return null
  return {
    // mqp: hack for temporary unwise choice of postgres timestamp without time zone type
    // -- we have to make it look like an ISO9601 date or the JS date constructor will
    // assume that it's in local time. will fix this up soon
    timestamp: tsToMillis(portfolio.ts! + '+0000'),
    investmentValue: +portfolio.investment_value!,
    totalDeposits: +portfolio.total_deposits!,
    balance: +portfolio.balance!,
  }
}
