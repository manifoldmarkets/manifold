import { firestore as adminFirestore } from 'firebase-admin'
import { z } from 'zod'
import { APIError, AuthedUser, newEndpoint, validate } from './api'
import { removeUndefinedProps } from '../../common/util/object'

const firestore = adminFirestore()

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().optional(),
  outcome: z.enum(['YES', 'NO', 'SKIP']),
})

export const logswipe = newEndpoint({}, async (req: any, auth: AuthedUser) => {
  const { contractId, amount, outcome } = validate(bodySchema, req.body)
  const swipeTime = Date.now()

  return await firestore.runTransaction(async (trans) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`private-users/${auth.uid}`)
    const [contractSnap, userSnap] = await trans.getAll(contractDoc, userDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(400, 'User not found.')

    const ref = firestore
      .collection(`/private-users/${auth.uid}/seenMarkets`)
      .doc(contractId)

    const data = removeUndefinedProps({
      id: contractId,
      amount,
      outcome,
      swipeTime,
    })
    await ref.set(data)
    return data
  })
})
