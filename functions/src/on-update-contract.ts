import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from './create-notification'
import { Contract } from '../../common/contract'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const { eventId } = context

    const contractUpdater = await getUser(contract.creatorId)
    if (!contractUpdater) throw new Error('Could not find contract updater')

    const previousValue = change.before.data() as Contract
    if (
      previousValue.closeTime !== contract.closeTime ||
      previousValue.question !== contract.question
    ) {
      let sourceText = ''
      if (
        previousValue.closeTime !== contract.closeTime &&
        contract.closeTime
      ) {
        sourceText = contract.closeTime.toString()
      } else if (previousValue.question !== contract.question) {
        sourceText = contract.question
      }

      await createCommentOrAnswerOrUpdatedContractNotification(
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
