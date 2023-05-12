import { Period } from 'web/lib/firebase/users'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { useEffect } from 'react'
import {
  inMemoryStore,
  usePersistentState,
} from 'web/hooks/use-persistent-state'
import { getCutoff } from 'web/lib/util/time'
import {
  getCurrentPortfolio,
  getPortfolioHistory,
} from 'common/supabase/portfolio-metrics'
import { db } from 'web/lib/supabase/db'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

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

export const useCurrentPortfolio = (userId: string | null | undefined) => {
  const [portfolio, setPortfolio] = usePersistentInMemoryState<
    PortfolioSnapshot | null | undefined
  >(undefined, `current-portfolio-${userId}`)

  useEffect(() => {
    if (userId) {
      getCurrentPortfolio(userId, db).then(setPortfolio)
    }
  }, [userId])

  return portfolio
}
