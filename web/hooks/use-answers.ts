import { useEffect, useState } from 'react'
import { Answer, DpmAnswer } from 'common/answer'
import {
  listenForAnswers,
  listenForAnswersCpmm,
} from 'web/lib/firebase/answers'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { getAnswersForContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useEffectCheckEquality } from './use-effect-check-equality'

export const useAnswers = (contractId: string) => {
  const [answers, setAnswers] = useState<DpmAnswer[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForAnswers(contractId, setAnswers)
  }, [contractId])

  return answers
}

export const useAnswersCpmm = (contractId: string) => {
  const [answers, setAnswers] = usePersistentInMemoryState<
    Answer[] | undefined
  >(undefined, 'answersCpmm-' + contractId)

  useEffect(() => {
    if (contractId) return listenForAnswersCpmm(contractId, setAnswers)
  }, [contractId])

  return answers
}

export const useAnswersForContracts = (contractIds: string[] | undefined) => {
  const [answersByContractId, setAnswersByContractId] = useState<{
    [answerId: string]: Answer[]
  }>()
  useEffectCheckEquality(() => {
    if (contractIds)
      getAnswersForContracts(db, contractIds).then((result) => {
        setAnswersByContractId(result)
      })
  }, [contractIds])
  return answersByContractId
}
