import { doc, collection, setDoc } from 'firebase/firestore'

import { getValues, listenForValues } from './utils'
import { db } from './init'
import { User } from '../../../common/user'
import { Answer } from '../../../common/answer'

function getAnswersCollection(contractId: string) {
  return collection(db, 'contracts', contractId, 'answers')
}

export async function createAnswer(
  contractId: string,
  text: string,
  user: User
) {
  const { id: userId, username, name, avatarUrl } = user

  const ref = doc(getAnswersCollection(contractId))

  const answer: Answer = {
    id: ref.id,
    contractId,
    createdTime: Date.now(),
    userId,
    username,
    name,
    avatarUrl,
    text,
  }

  return await setDoc(ref, answer)
}

export async function listAllAnswers(contractId: string) {
  const answers = await getValues<Answer>(getAnswersCollection(contractId))
  answers.sort((c1, c2) => c1.createdTime - c2.createdTime)
  return answers
}

export function listenForAnswers(
  contractId: string,
  setAnswers: (answers: Answer[]) => void
) {
  return listenForValues<Answer>(
    getAnswersCollection(contractId),
    (answers) => {
      answers.sort((c1, c2) => c1.createdTime - c2.createdTime)
      setAnswers(answers)
    }
  )
}
