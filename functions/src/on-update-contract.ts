import * as functions from 'firebase-functions'
import { getContract, getUser } from './utils'
import { createNotification } from './create-notification'
import { NotificationSourceTypes } from '../../common/notification'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const contract = await getContract(contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with answer')

    const contractUpdater = await getUser(contract.creatorId)
    if (!contractUpdater) throw new Error('Could not find contract updater')

    await createNotification(
      contract.id,
      NotificationSourceTypes.CONTRACT,
      contract,
      contractUpdater
    )
  })
