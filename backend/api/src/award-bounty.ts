import { ContractComment } from 'common/comment'
import * as admin from 'firebase-admin'
import { runAwardBountyTxn } from 'shared/txn/run-bounty-txn'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { FieldValue } from 'firebase-admin/firestore'
import { createBountyAwardedNotification } from 'shared/create-notification'
import { getContract } from 'shared/utils'

const bodySchema = z
  .object({
    contractId: z.string(),
    commentId: z.string(),
    amount: z.number().gt(0).int().finite(),
  })
  .strict()

export const awardbounty = authEndpoint(async (req, auth) => {
  const { contractId, commentId, amount } = validate(bodySchema, req.body)

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const commentDoc = firestore.doc(
      `contracts/${contractId}/comments/${commentId}`
    )
    const commentSnap = await transaction.get(commentDoc)
    if (!commentSnap.exists) throw new APIError(404, 'Comment not found')
    const comment = commentSnap.data() as ContractComment

    const { txn } = await runAwardBountyTxn(
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

    transaction.update(commentDoc, {
      bountyAwarded: FieldValue.increment(amount),
    })
    const contract = await getContract(contractId)
    if (contract) {
      await createBountyAwardedNotification(
        comment.userId,
        contract,
        contractId,
        amount
      )
    }
    return txn
  })
})

const firestore = admin.firestore()
