import * as functions from 'firebase-functions'
import { getContract, getUser } from 'shared/utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from 'shared/create-notification'
import { Answer, DpmAnswer } from 'common/answer'
import { secrets } from 'common/secrets'

export const onCreateAnswer = functions
  .runWith({ secrets })
  .firestore.document('contracts/{contractId}/answers/{answerNumber}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const { eventId } = context
    const answer = change.data() as Answer | DpmAnswer
    // Ignore ante answer.
    if ('number' in answer && answer.number === 0) return

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
