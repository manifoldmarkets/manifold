import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { throwErrorIfNotMod } from 'shared/helpers/auth'

export const unlistAndCancelUserContracts: APIHandler<
  'unlist-and-cancel-user-contracts'
> = async ({ userId }, auth) => {
  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'Only admins and mods can perform this action.')
  }

  await throwErrorIfNotMod(auth.uid)

  const firestore = admin.firestore()
  const snapshot = await firestore
    .collection('contracts')
    .where('creatorId', '==', userId)
    .get()

  if (snapshot.empty) {
    console.log('No contracts found for this user.')
    return
  }

  const contracts = snapshot.docs.map((doc) => doc.data())

  if (contracts.length > 5) {
    throw new APIError(
      400,
      'This user has too many markets. You can only super ban users with 5 or less.'
    )
  }

  try {
    await Promise.all(
      contracts.map((contract) => {
        return firestore.doc(`contracts/${contract.id}`).update({
          visibility: 'unlisted',
          resolution: 'CANCEL',
        })
      })
    )
  } catch (error) {
    console.error('Error updating contracts:', error)
    throw new APIError(500, 'Failed to update one or more contracts.')
  }
}
