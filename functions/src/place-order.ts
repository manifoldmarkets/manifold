import { APIError, newEndpoint, validate } from './api'
import { log } from './utils'
import { z } from 'zod'
import * as admin from 'firebase-admin'
import { Contract } from '../../common/contract'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gte(1),
  outcome: z.enum(['YES', 'NO']),
})
const firestore = admin.firestore()

export const placeorder = newEndpoint(
  { minInstances: 2 },
  async (req, auth) => {
    const { amount, contractId, outcome } = validate(bodySchema, req.body)
    log(`Inside endpoint handler for ${auth.uid} for contract ${contractId}.`)
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await contractDoc.get()

    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')

    const contract = contractSnap.data() as Contract

    const { closeTime, outcomeType, mechanism } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed.')
    if (
      (outcomeType !== 'BINARY' && outcomeType !== 'PSEUDO_NUMERIC') ||
      mechanism !== 'cpmm-1'
    )
      throw new APIError(400, 'Invalid contract type.')
    const ref = firestore.collection(`contracts/${contractId}/orders`).doc()
    const userId = auth.uid
    const order = {
      id: ref.id,
      userId,
      contractId,
      createdTime: Date.now(),
      amount,
      outcome,
      probBefore: contract.prob,
      isFilled: false,
      isCancelled: false,
    }
    await ref.set(order)
    log(`Order created: ${order.id} for user ${userId}`)

    return { order }
  }
)
