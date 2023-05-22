import { collection } from 'firebase/firestore'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { DpmAnswer } from 'common/answer'

function getAnswersCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'answers')
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
