import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createNotification } from './create-notification'
import { NotificationSourceTypes } from '../../common/notification'
import { Contract } from '../../common/contract'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract

    const contractUpdater = await getUser(contract.creatorId)
    if (!contractUpdater) throw new Error('Could not find contract updater')

    const previousValue = change.before.data() as Contract
    if (
      previousValue.closeTime !== contract.closeTime ||
      previousValue.description !== contract.description ||
      previousValue.isResolved !== contract.isResolved
    ) {
      await createNotification(
        contract.id,
        NotificationSourceTypes.CONTRACT,
        contract,
        contractUpdater,
        context.eventId
      )
    }
  })
