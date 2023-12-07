import * as admin from 'firebase-admin'
import { Contract } from 'common/contract'
import { getUser } from 'shared/utils'

import { isAdminId } from 'common/envs/constants'
import { APIError, typedEndpoint } from './helpers'

export const closeMarket = typedEndpoint(
  'close',
  async (props, auth, { log }) => {
    const { contractId, closeTime } = props
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await contractDoc.get()
    if (!contractSnap.exists)
      throw new APIError(404, 'No contract exists with the provided ID')
    const contract = contractSnap.data() as Contract
    const { creatorId } = contract

    if (creatorId !== auth.uid && !isAdminId(auth.uid))
      throw new APIError(403, 'User is not creator of contract')

    const now = Date.now()
    if (!closeTime && contract.closeTime && contract.closeTime < now)
      throw new APIError(403, 'Contract already closed')

    if (closeTime && closeTime < now)
      throw new APIError(
        400,
        'Close time must be in the future. ' +
          'Alternatively, do not provide a close time to close immediately.'
      )

    const creator = await getUser(creatorId)
    if (!creator) throw new APIError(500, 'Creator not found')

    const updatedContract = {
      ...contract,
      closeTime: closeTime ? closeTime : now,
    }

    await contractDoc.update(updatedContract)

    log('contract ' + contractId + ' closed')

    // return updatedContract
  }
)

const firestore = admin.firestore()
