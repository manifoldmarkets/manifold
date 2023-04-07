import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract, contractPath } from 'common/contract'
import { revalidateStaticProps } from 'shared/utils'

import { isAdmin, isManifoldId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  contractId: z.string(),
})

export const deleteMarket = authEndpoint(async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists)
    throw new APIError(404, 'No contract exists with the provided ID')
  const contract = contractSnap.data() as Contract
  const { creatorId } = contract
  const firebaseUser = await admin.auth().getUser(auth.uid)

  if (
    creatorId !== auth.uid &&
    !isManifoldId(auth.uid) &&
    !isAdmin(firebaseUser.email)
  )
    throw new APIError(403, 'User is not creator of contract')

  const { resolution, uniqueBettorCount } = contract
  if (resolution !== 'CANCEL')
    throw new APIError(400, 'Contract must be resolved N/A to be deleted')

  if (uniqueBettorCount && uniqueBettorCount >= 10)
    throw new APIError(
      400,
      'Contract must have less than 10 bettors to be deleted'
    )

  await contractDoc.update({ deleted: true })

  await revalidateStaticProps(contractPath(contract))

  console.log('contract ', contractId, 'deleted')

  return { status: 'success' }
})

const firestore = admin.firestore()
