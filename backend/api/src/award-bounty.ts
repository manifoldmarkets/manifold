import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import * as admin from 'firebase-admin'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { runTxn } from 'shared/txn/run-txn'
import { FieldValue } from 'firebase-admin/firestore'
import { runAwardBountyTxn } from 'shared/txn/run-bounty-txn'

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
    const commentDoc = firestore.doc(
      `contracts/${contractId}/comments/${commentId}`
    )
    const commentSnap = await transaction.get(commentDoc)
    if (!commentSnap.exists) throw new APIError(400, 'Invalid comment')
    const comment = commentSnap.data() as ContractComment

    await runAwardBountyTxn(
      transaction,
      {
        fromId: contractId,
        fromType: 'CONTRACT',
        toId: comment.userId,
        toType: 'USER',
        amount,
        token: 'M$',
        category: 'BOUNTY_AWARDED',
        data: { comment: comment.id },
      },
      auth.uid
    )

    return { status: 'hi' }
  })
})

const firestore = admin.firestore()
