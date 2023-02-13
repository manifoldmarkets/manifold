import * as functions from 'firebase-functions'
import { getContract, getUser } from 'shared/utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from '../create-notification'
import { Answer } from 'common/answer'

export const onCreateAnswer = functions.firestore
  .document('contracts/{contractId}/answers/{answerNumber}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const { eventId } = context
    const answer = change.data() as Answer
    // Ignore ante answer.
    if (answer.number === 0) return

    const contract = await getContract(contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with answer')

    const answerCreator = await getUser(answer.userId)
    if (!answerCreator) throw new Error('Could not find answer creator')
    await createCommentOrAnswerOrUpdatedContractNotification(
      answer.id,
      'answer',
      'created',
      answerCreator,
      eventId,
      answer.text,
      contract
    )
  })
