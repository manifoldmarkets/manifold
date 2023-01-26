import { useQueryClient } from 'react-query'
import { DAY_MS, HOUR_MS, MINUTE_MS, sleep } from 'common/util/time'
import { Period } from 'web/lib/firebase/users'
import {
  getPortfolioHistory,
  PortfolioSnapshot,
} from 'web/lib/supabase/portfolio-history'
import { useEffect } from 'react'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'

export const getCutoff = (period: Period) => {
  if (period === 'allTime') {
    return new Date(0).valueOf()
  }
  const nowRounded = Math.round(Date.now() / HOUR_MS) * HOUR_MS
  return nowRounded - periodDurations[period]
}

export const usePrefetchPortfolioHistory = (userId: string, period: Period) => {
  const queryClient = useQueryClient()
  const cutoff = getCutoff(period)
  return queryClient.prefetchQuery(
    ['portfolio-history', userId, cutoff],
    () => sleep(1000).then(() => getPortfolioHistory(userId, cutoff)),
    { staleTime: 15 * MINUTE_MS }
  )
}

export const usePortfolioHistory = (userId: string, period: Period) => {
  const cutoff = getCutoff(period)
  const [portfolioHistories, setPortfolioHistories] = usePersistentState<
    Record<string, PortfolioSnapshot[] | undefined>
  >(
    {},
    {
      store: inMemoryStore(),
      key: `user-portfolio-history-${userId}`,
    }
  )

  useEffect(() => {
    // We could remove this next line or set a lastUpdatedTime in order to re-fetch new data.
    if (portfolioHistories[cutoff]) return
    getPortfolioHistory(userId, cutoff).then((portfolioHistory) => {
      setPortfolioHistories((prev) => ({
        ...prev,
        [cutoff]: portfolioHistory,
      }))
    })
  }, [userId, cutoff, setPortfolioHistories, portfolioHistories])
  return portfolioHistories[cutoff]
}

export const periodDurations: {
  [period in Exclude<Period, 'allTime'>]: number
} = {
  daily: 1 * DAY_MS,
  weekly: 7 * DAY_MS,
  monthly: 30 * DAY_MS,
}
