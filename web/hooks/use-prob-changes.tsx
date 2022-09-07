import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import {
  getProbChangesNegative,
  getProbChangesPositive,
} from 'web/lib/firebase/contracts'

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
