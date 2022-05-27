import * as functions from 'firebase-functions'
import { getContract, getUser } from './utils'
import { createNotification } from './create-notification'
import { NotificationSourceTypes } from '../../common/notification'
import { Answer } from '../../common/answer'

export const onCreateAnswer = functions.firestore
  .document('contracts/{contractId}/answers/{answerNumber}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const contract = await getContract(contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with answer')

    const answer = change.data() as Answer
    if (answer.number === 0) return

    const answerCreator = await getUser(answer.userId)
    if (!answerCreator) throw new Error('Could not find answer creator')

    await createNotification(
      answer.id,
      NotificationSourceTypes.ANSWER,
      contract,
      answerCreator
    )
  })
