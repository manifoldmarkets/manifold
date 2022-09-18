import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { CPMMContract } from 'common/contract'
import { MINUTE_MS } from 'common/util/time'
import { useQuery, useQueryClient } from 'react-query'
import {
  getProbChangesNegative,
  getProbChangesPositive,
} from 'web/lib/firebase/contracts'
import { getValues } from 'web/lib/firebase/utils'
import { getIndexName, searchClient } from 'web/lib/service/algolia'

export const useProbChangesAlgolia = (userId: string) => {
  const { data: positiveData } = useQuery(['prob-change-day', userId], () =>
    searchClient
      .initIndex(getIndexName('prob-change-day'))
      .search<CPMMContract>('', { facetFilters: ['uniqueBettorIds:' + userId] })
  )
  const { data: negativeData } = useQuery(
    ['prob-change-day-ascending', userId],
    () =>
      searchClient
        .initIndex(getIndexName('prob-change-day-ascending'))
        .search<CPMMContract>('', {
          facetFilters: ['uniqueBettorIds:' + userId],
        })
  )

  if (!positiveData || !negativeData) {
    return undefined
  }

  return {
    positiveChanges: positiveData.hits,
    negativeChanges: negativeData.hits,
  }
}

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
