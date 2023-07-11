import { ContractComment } from 'common/comment'
import * as admin from 'firebase-admin'
import { runAddBountyTxn, runAwardBountyTxn } from 'shared/txn/run-bounty-txn'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { FieldValue } from 'firebase-admin/firestore'
import {
  createBountyAddedNotification,
  createBountyAwardedNotification,
} from 'shared/create-notification'
import { getContract } from 'shared/utils'
import { Contract } from 'common/contract'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gt(0),
})

export const addbounty = authEndpoint(async (req, auth) => {
  const { contractId, amount } = validate(bodySchema, req.body)

  if (!isFinite(amount) || amount < 1) throw new APIError(400, 'Invalid amount')

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
        contractId,
        amount
      )
    }
    return txn
  })
})

const firestore = admin.firestore()
