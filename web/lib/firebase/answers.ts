import { collection } from 'firebase/firestore'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { Answer, DpmAnswer } from 'common/answer'

function getAnswersCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'answers')
}

function getAnswersCpmmCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'answersCpmm')
}

export async function listAllAnswers(contractId: string) {
  const answers = await getValues<DpmAnswer>(getAnswersCollection(contractId))
  answers.sort((c1, c2) => c1.createdTime - c2.createdTime)
  return answers
}

export function listenForAnswers(
  contractId: string,
  setAnswers: (answers: DpmAnswer[]) => void
) {
  return listenForValues<DpmAnswer>(
    getAnswersCollection(contractId),
    (answers) => {
      answers.sort((c1, c2) => c1.createdTime - c2.createdTime)
      setAnswers(answers)
    }
  )
}

export function listenForAnswersCpmm(
  contractId: string,
  setAnswers: (answers: Answer[]) => void
) {
  return listenForValues<Answer>(
    getAnswersCpmmCollection(contractId),
    (answers) => {
      answers.sort(
        (c1, c2) => (c1.index ?? c1.createdTime) - (c2.index ?? c2.createdTime)
      )
      setAnswers(answers)
    }
  )
}
