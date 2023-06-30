import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import * as admin from 'firebase-admin'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { runTxn } from 'shared/run-txn'
import { FieldValue } from 'firebase-admin/firestore'

const bodySchema = z.object({
  contractId: z.string(),
  commentId: z.string(),
  amount: z.number().gt(0).optional(),
})

export const awardbounty = authEndpoint(async (req, auth) => {
  const { contractId, commentId, amount } = validate(bodySchema, req.body)

  if (!amount || !isFinite(amount) || amount < 1)
    throw new APIError(400, 'Invalid amount')

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract
    if (
      contract.mechanism !== 'none' ||
      contract.outcomeType !== 'BOUNTIED_QUESTION'
    ) {
      throw new APIError(
        400,
        'Invalid contract, only bountied questions are supported'
      )
    }

    if (contract.creatorId !== auth.uid) {
      throw new APIError(
        400,
        'A bounty can only be given by the creator of the question'
      )
    }

    const commentDoc = firestore.doc(
      `contracts/${contractId}/comments/${commentId}`
    )
    const commentSnap = await transaction.get(commentDoc)
    if (!commentSnap.exists) throw new APIError(400, 'Invalid comment')
    const comment = commentSnap.data() as ContractComment

    const recipientDoc = firestore.doc(`users/${comment.userId}`)
    const recipientSnap = await transaction.get(recipientDoc)
    if (!recipientSnap.exists) throw new APIError(400, 'Invalid recipient')
    const recipient = recipientSnap.data() as User

    const { bountyLeft } = contract
    if (bountyLeft < amount) {
      throw new APIError(
        400,
        `There is only M${bountyLeft} of bounty left to award, which is less than M${amount}`
      )
    }

    if (!isFinite(bountyLeft - amount)) {
      throw new APIError(
        500,
        'Invalid bounty balance left for ' + contract.question
      )
    }

    const { status, txn } = await runTxn(transaction, {
      category: 'BOUNTY_AWARDED',
      fromType: 'BOUNTY_CONTRACT',
      toType: 'USER',
      token: 'M$',
    })

    if (status !== 'success' || !txn)
      throw new APIError(500, 'Failed to award bounty')
    transaction.update(contractDoc, {
      bountyTxns: FieldValue.arrayUnion(txn.id),
    })

    return txn
  })
})

const firestore = admin.firestore()
