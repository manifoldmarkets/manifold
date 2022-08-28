import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { getPortfolioHistoryQuery, Period } from 'web/lib/firebase/users'

export const usePortfolioHistory = (userId: string, period: Period) => {
  const nowRounded = Math.round(Date.now() / HOUR_MS) * HOUR_MS
  const cutoff = periodToCutoff(nowRounded, period).valueOf()

  const result = useFirestoreQueryData(
    ['portfolio-history', userId, cutoff],
    getPortfolioHistoryQuery(userId, cutoff),
    { subscribe: true, includeMetadataChanges: true },
    // Temporary workaround for react-query bug:
    // https://github.com/invertase/react-query-firebase/issues/25
    { refetchOnMount: 'always' }
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
