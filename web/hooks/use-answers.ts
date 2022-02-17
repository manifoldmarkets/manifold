import { useEffect, useState } from 'react'
import { Answer } from '../../common/answer'
import { listenForAnswers } from '../lib/firebase/answers'

export const useAnswers = (contractId: string) => {
  const [answers, setAnswers] = useState<Answer[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForAnswers(contractId, setAnswers)
  }, [contractId])

  return answers
}
