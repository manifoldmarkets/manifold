import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract, contractPath } from 'common/contract'
import { revalidateStaticProps } from 'shared/utils'

import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'

const bodySchema = z
  .object({
    contractId: z.string(),
  })
  .strict()

export const deleteMarket = authEndpoint(async (req, auth, log) => {
  const { contractId } = validate(bodySchema, req.body)
  const contractDoc = firestore.doc(`contracts/${contractId}`)
  const contractSnap = await contractDoc.get()
  if (!contractSnap.exists)
    throw new APIError(404, 'No contract exists with the provided ID')
  const contract = contractSnap.data() as Contract
  const { creatorId } = contract

  if (creatorId !== auth.uid && !isAdminId(auth.uid))
    throw new APIError(403, 'User is not creator of contract')

  const { resolution, uniqueBettorCount } = contract
  if (resolution !== 'CANCEL')
    throw new APIError(403, 'Contract must be resolved N/A to be deleted')

  if (uniqueBettorCount && uniqueBettorCount >= 2)
    throw new APIError(
      403,
      'Contract must have less than 2 bettors to be deleted'
    )

  await contractDoc.update({ deleted: true })

  // Note: Wait for 3 seconds to allow the contract to replicated to supabase.
  await new Promise((resolve) => setTimeout(resolve, 3000))
  await revalidateStaticProps(contractPath(contract))

  log('contract ' + contractId + ' deleted')

  return { status: 'success' }
})

const firestore = admin.firestore()
