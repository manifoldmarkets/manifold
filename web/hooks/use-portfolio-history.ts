import { useQueryClient } from 'react-query'
import { MINUTE_MS, sleep } from 'common/util/time'
import { Period } from 'web/lib/firebase/users'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { useEffect } from 'react'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { getCutoff } from 'web/lib/util/time'
import { getPortfolioHistory } from 'common/supabase/portfolio-metrics'
import { db } from 'web/lib/supabase/db'

export const usePrefetchPortfolioHistory = (userId: string, period: Period) => {
  const queryClient = useQueryClient()
  const cutoff = getCutoff(period)
  return queryClient.prefetchQuery(
    ['portfolio-history', userId, cutoff],
    () => sleep(1000).then(() => getPortfolioHistory(userId, cutoff, db)),
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
    getPortfolioHistory(userId, cutoff, db).then((portfolioHistory) => {
      setPortfolioHistories((prev) => ({
        ...prev,
        [cutoff]: portfolioHistory,
      }))
    })
  }, [userId, cutoff, setPortfolioHistories, portfolioHistories])
  return portfolioHistories[cutoff]
}
