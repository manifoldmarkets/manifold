import { useEffect, useState } from 'react'
import { Answer, DpmAnswer } from 'common/answer'
import {
  listenForAnswers,
  listenForAnswersCpmm,
} from 'web/lib/firebase/answers'

export const useAnswers = (contractId: string) => {
  const [answers, setAnswers] = useState<DpmAnswer[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForAnswers(contractId, setAnswers)
  }, [contractId])

  return answers
}

export const useAnswersCpmm = (contractId: string) => {
  const [answers, setAnswers] = useState<Answer[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForAnswersCpmm(contractId, setAnswers)
  }, [contractId])

  return answers
}
