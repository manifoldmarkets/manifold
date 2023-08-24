import { Period } from 'web/lib/firebase/users'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { useEffect } from 'react'
import { getCutoff } from 'web/lib/util/time'
import {
  getCurrentPortfolio,
  getPortfolioHistory,
} from 'common/supabase/portfolio-metrics'
import { db } from 'web/lib/supabase/db'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

export const usePortfolioHistory = (userId: string, period: Period) => {
  const cutoff = getCutoff(period)
  const [portfolioHistories, setPortfolioHistories] =
    usePersistentInMemoryState<Record<string, PortfolioSnapshot[] | undefined>>(
      {},
      `user-portfolio-history-${userId}`
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
