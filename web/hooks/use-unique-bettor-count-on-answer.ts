import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { getAnswerBettorCount } from 'common/supabase/answers'
import { useEffect } from 'react'
import { db } from 'web/lib/supabase/db'

export const useUniqueBettorCountOnAnswer = (
  contractId: string,
  answerId: string | undefined
) => {
  const [uniqueAnswerBettorCount, setUniqueAnswerBettorCount] =
    usePersistentInMemoryState<number>(
      0,
      'uniqueAnswerBettorCount-' + contractId + '-' + answerId
    )
  useEffect(() => {
    if (answerId)
      getAnswerBettorCount(db, contractId, answerId).then(
        setUniqueAnswerBettorCount
      )
  }, [answerId])
  return uniqueAnswerBettorCount
}
