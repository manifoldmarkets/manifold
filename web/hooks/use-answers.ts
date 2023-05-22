import { useEffect, useState } from 'react'
import { DpmAnswer } from 'common/answer'
import { listenForAnswers } from 'web/lib/firebase/answers'

export const useAnswers = (contractId: string) => {
  const [answers, setAnswers] = useState<DpmAnswer[] | undefined>()

  useEffect(() => {
    if (contractId) return listenForAnswers(contractId, setAnswers)
  }, [contractId])

  return answers
}
