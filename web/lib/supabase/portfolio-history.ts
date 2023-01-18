import { run, selectFrom } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { sortBy } from 'lodash'

export type PortfolioSnapshot = Awaited<
  ReturnType<typeof getPortfolioHistory>
>[number]

export async function getPortfolioHistory(userId: string, cutoff: number) {
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
