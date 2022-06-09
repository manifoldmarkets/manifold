import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createNotification } from './create-notification'
import { Contract } from '../../common/contract'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const { eventId } = context

    const contractUpdater = await getUser(contract.creatorId)
    if (!contractUpdater) throw new Error('Could not find contract updater')

    const previousValue = change.before.data() as Contract
    if (previousValue.isResolved !== contract.isResolved) {
      let resolutionText = contract.resolution ?? contract.question
      if (contract.outcomeType === 'FREE_RESPONSE') {
        const answerText = contract.answers.find(
          (answer) => answer.id === contract.resolution
        )?.text
        if (answerText) resolutionText = answerText
      } else if (contract.outcomeType === 'BINARY') {
        if (resolutionText === 'MKT' && contract.resolutionProbability)
          resolutionText = `${contract.resolutionProbability}%`
        else if (resolutionText === 'MKT') resolutionText = 'PROB'
      }

      await createNotification(
        contract.id,
        'contract',
        'resolved',
        contractUpdater,
        eventId,
        resolutionText,
        contract
      )
    } else if (
      previousValue.closeTime !== contract.closeTime ||
      previousValue.description !== contract.description
    ) {
      await createNotification(
        contract.id,
        'contract',
        'updated',
        contractUpdater,
        eventId,
        contract.question,
        contract
      )
    }
  })
