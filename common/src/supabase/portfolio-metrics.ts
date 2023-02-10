import { run, selectFrom, SupabaseClient } from './utils'
import { chunk, groupBy, sortBy } from 'lodash'

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
export async function getPortfolioHistories(
  userIds: string[],
  cutoff: number,
  db: SupabaseClient
) {
  const chunks = chunk(userIds, 200)
  const promises = chunks.map(async (chunk) => {
    const { data } = await run(
      selectFrom(
        db,
        'user_portfolio_history',
        'timestamp',
        'investmentValue',
        'totalDeposits',
        'balance',
        'userId'
      )
        .in('user_id', chunk)
        .gt('data->>timestamp', cutoff)
    )

    return sortBy(data, 'timestamp')
  })
  return groupBy((await Promise.all(promises)).flat(), 'userId')
}
