import { sortBy } from 'lodash'

import { getCutoff } from 'common/period'
import { convertPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

export const getUserPortfolioHistory: APIHandler<
  'get-user-portfolio-history'
> = async (props) => {
  const pg = createSupabaseDirectClient()
  const { userId, period } = props
  const isAllTime = period === 'allTime'
  const cutoff = isAllTime ? getCutoff('monthly') : getCutoff(period)

  const startDate = new Date(cutoff).toISOString()
  const allTimeQuery = isAllTime
    ? `select *
    from user_portfolio_history
    where
      user_id = $1
      and ts < now() - interval '1 month';`
    : ''
  const data = await pg.multi(
    `select *
    from user_portfolio_history
    where
      user_id = $1
      and ts > $2
    order by random()
    limit 1000;
    ${allTimeQuery}`,
    [userId, startDate]
  )
  const latestPoints = data[0].map(convertPortfolioHistory)
  const laterPoints = isAllTime ? data[1].map(convertPortfolioHistory) : []
  const allPoints = [...latestPoints, ...laterPoints]

  return sortBy(allPoints, 'timestamp')
}
