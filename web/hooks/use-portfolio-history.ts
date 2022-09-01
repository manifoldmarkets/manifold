import { QueryClient } from 'react-query'
import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { getPortfolioHistoryQuery, Period } from 'web/lib/firebase/users'

const queryClient = new QueryClient()

const getCutoff = (period: Period) => {
  const nowRounded = Math.round(Date.now() / HOUR_MS) * HOUR_MS
  return periodToCutoff(nowRounded, period).valueOf()
}

export const prefetchPortfolioHistory = (userId: string, period: Period) => {
  const cutoff = getCutoff(period)
  return queryClient.prefetchQuery(['portfolio-history', userId, cutoff], () =>
    getPortfolioHistoryQuery(userId, cutoff)
  )
}

export const usePortfolioHistory = (userId: string, period: Period) => {
  const cutoff = getCutoff(period)
  const result = useFirestoreQueryData(
    ['portfolio-history', userId, cutoff],
    getPortfolioHistoryQuery(userId, cutoff)
  )
  return result.data
}

const periodToCutoff = (now: number, period: Period) => {
  switch (period) {
    case 'daily':
      return now - 1 * DAY_MS
    case 'weekly':
      return now - 7 * DAY_MS
    case 'monthly':
      return now - 30 * DAY_MS
    case 'allTime':
    default:
      return new Date(0)
  }
}
