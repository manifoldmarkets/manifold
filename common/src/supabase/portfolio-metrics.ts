import { PortfolioMetrics } from 'common/portfolio-metrics'
import { filterDefined } from 'common/util/array'
import { run, selectFrom, SupabaseClient } from './utils'
import { chunk, Dictionary, sortBy } from 'lodash'

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

export async function getPortfolioHistories(
  userIds: string[],
  cutoff: number,
  db: SupabaseClient
) {
  // chunk user ids into smaller groups - above 20 doesn't work well
  const chunks = chunk(userIds, 20)
  const promises = chunks.map(async (chunk) => {
    const { data, error } = await db.rpc(
      'get_portfolio_histories_grouped_by_user_ids_from',
      {
        uids: chunk,
        start: cutoff,
      }
    )

    if (!data || error) {
      console.error('Error getting portfolio histories:', error)
      return undefined
    }
    return data
  })
  const data = filterDefined((await Promise.all(promises)).flat())
  const userIdsToMetrics = {} as Dictionary<PortfolioMetrics[]>
  data.flat().forEach((d) => {
    userIdsToMetrics[d.user_id] = d.portfolio_metrics as PortfolioMetrics[]
  })
  return userIdsToMetrics
}
