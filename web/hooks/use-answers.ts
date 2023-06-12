import { useEffect, useState } from 'react'
import { Answer, DpmAnswer } from 'common/answer'
import {
  listenForAnswers,
  listenForAnswersCpmm,
} from 'web/lib/firebase/answers'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

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
