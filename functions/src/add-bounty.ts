import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { APIError, newEndpoint, validate } from './api'

const firestore = admin.firestore()

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gt(0),
})

export const addbounty = newEndpoint({}, async (req, auth) => {
  const { amount, contractId } = validate(bodySchema, req.body)

  return await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract
    if (contract.outcomeType !== 'BOUNTY')
      throw new APIError(400, "Can't add bounties to non-BOUNTY contracts")

    const { closeTime } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Contract is closed')

    if (user.balance < amount) throw new APIError(400, 'Insufficient balance')

    // TODO: Capture with txns?
    transaction.update(userDoc, {
      balance: user.balance - amount,
      totalDeposits: user.totalDeposits - amount,
    })

    const existingPrize = contract.prizes[user.id] ?? 0

    transaction.update(contractDoc, {
      prizes: {
        ...contract.prizes,
        [user.id]: existingPrize + amount,
      },
      totalPrizes: contract.totalPrizes + amount,
    })

    return { status: 'success' }
  })
})
