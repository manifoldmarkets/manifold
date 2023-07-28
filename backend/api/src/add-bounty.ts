import * as admin from 'firebase-admin'
import { createBountyAddedNotification } from 'shared/create-notification'
import { runAddBountyTxn } from 'shared/txn/run-bounty-txn'
import { getContract } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gt(0).int().finite(),
})

export const addbounty = authEndpoint(async (req, auth) => {
  const { contractId, amount } = validate(bodySchema, req.body)

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const { status, txn } = await runAddBountyTxn(transaction, {
      fromId: auth.uid,
      fromType: 'USER',
      toId: contractId,
      toType: 'CONTRACT',
      amount,
      token: 'M$',
      category: 'BOUNTY_ADDED',
    })

    const contract = await getContract(contractId)
    if (contract && contract.creatorId !== auth.uid) {
      await createBountyAddedNotification(
        contract.creatorId,
        contract,
        auth.uid,
        amount
      )
    }
    return txn
  })
})

const firestore = admin.firestore()
