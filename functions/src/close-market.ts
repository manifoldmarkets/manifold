import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract } from '../../common/contract'
import { getUser } from './utils'

import { isAdmin, isManifoldId } from '../../common/envs/constants'
import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  contractId: z.string(),
})

export const closemarket = newEndpoint({}, async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists)
    throw new APIError(404, 'No contract exists with the provided ID')
  const contract = contractSnap.data() as Contract
  const { creatorId, closeTime } = contract
  const firebaseUser = await admin.auth().getUser(auth.uid)

  if (
    creatorId !== auth.uid &&
    !isManifoldId(auth.uid) &&
    !isAdmin(firebaseUser.email)
  )
    throw new APIError(403, 'User is not creator of contract')

  const now = Date.now()
  if (closeTime && closeTime < now)
    throw new APIError(400, 'Contract already closed')

  const creator = await getUser(creatorId)
  if (!creator) throw new APIError(500, 'Creator not found')

  const updatedContract = {
    ...contract,
    closeTime: now,
  }

  await contractDoc.update(updatedContract)

  console.log('contract ', contractId, 'closed')

  return updatedContract
})

const firestore = admin.firestore()
