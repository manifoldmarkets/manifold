import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { MINUTE_MS } from 'common/util/time'
import { useQueryClient } from 'react-query'
import {
  getProbChangesNegative,
  getProbChangesPositive,
} from 'web/lib/firebase/contracts'
import { getValues } from 'web/lib/firebase/utils'

export const useProbChanges = (userId: string) => {
  const { data: positiveChanges } = useFirestoreQueryData(
    ['prob-changes-day-positive', userId],
    getProbChangesPositive(userId)
  )
  const { data: negativeChanges } = useFirestoreQueryData(
    ['prob-changes-day-negative', userId],
    getProbChangesNegative(userId)
  )

  if (!positiveChanges || !negativeChanges) {
    return undefined
  }

  return { positiveChanges, negativeChanges }
}

export const usePrefetchProbChanges = (userId: string | undefined) => {
  const queryClient = useQueryClient()
  if (userId) {
    queryClient.prefetchQuery(
      ['prob-changes-day-positive', userId],
      () => getValues(getProbChangesPositive(userId)),
      { staleTime: MINUTE_MS }
    )
    queryClient.prefetchQuery(
      ['prob-changes-day-negative', userId],
      () => getValues(getProbChangesNegative(userId)),
      { staleTime: MINUTE_MS }
    )
  }
}
