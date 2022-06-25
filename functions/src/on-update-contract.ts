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
      let sourceText = ''
      if (previousValue.closeTime !== contract.closeTime && contract.closeTime)
        sourceText = contract.closeTime.toString()
      else {
        const oldTrimmedDescription = previousValue.description.trim()
        const newTrimmedDescription = contract.description.trim()
        if (oldTrimmedDescription === '') sourceText = newTrimmedDescription
        else
          sourceText = newTrimmedDescription
            .split(oldTrimmedDescription)[1]
            .trim()
      }

      await createNotification(
        contract.id,
        'contract',
        'updated',
        contractUpdater,
        eventId,
        sourceText,
        contract
      )
    }
  })
