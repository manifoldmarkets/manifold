import { collection } from 'firebase/firestore'

import { listenForValues } from './utils'
import { db } from './init'
import { Answer } from 'common/answer'

function getAnswersCpmmCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'answersCpmm')
}

export function listenForAnswersCpmm(
  contractId: string,
  setAnswers: (answers: Answer[]) => void
) {
  return listenForValues<Answer>(
    getAnswersCpmmCollection(contractId),
    (answers) => {
      answers.sort((c1, c2) => c1.index - c2.index)
      setAnswers(answers)
    }
  )
}
