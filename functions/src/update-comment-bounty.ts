import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { removeUndefinedProps } from '../../common/util/object'
import { APIError, newEndpoint, validate } from './api'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from '../../common/antes'
import { isProd } from './utils'
import {
  CommentBountyDepositTxn,
  CommentBountyWithdrawalTxn,
} from '../../common/txn'
import { runTxn } from './transact'
import { Comment } from '../../common/comment'
import { createBountyNotification } from './create-notification'

const bodySchema = z.object({
  contractId: z.string(),
  amount: z.number().gt(0),
})
const awardBodySchema = z.object({
  contractId: z.string(),
  commentId: z.string(),
  amount: z.number().gt(0),
})

export const addcommentbounty = newEndpoint({}, async (req, auth) => {
  const { amount, contractId } = validate(bodySchema, req.body)

  if (!isFinite(amount)) throw new APIError(400, 'Invalid amount')

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract

    if (user.balance < amount)
      throw new APIError(400, 'Insufficient user balance')

    const newCommentBountyTxn = {
      fromId: user.id,
      fromType: 'USER',
      toId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      toType: 'BANK',
      amount,
      token: 'M$',
      category: 'COMMENT_BOUNTY',
      data: {
        contractId,
      },
      description: `Deposit M$${amount} from ${user.id} for comment bounty for contract ${contractId}`,
    } as CommentBountyDepositTxn

    const result = await runTxn(transaction, newCommentBountyTxn)

    transaction.update(
      contractDoc,
      removeUndefinedProps({
        openCommentBounties: (contract.openCommentBounties ?? 0) + amount,
      })
    )

    return result
  })
})
export const awardcommentbounty = newEndpoint({}, async (req, auth) => {
  const { amount, commentId, contractId } = validate(awardBodySchema, req.body)

  if (!isFinite(amount)) throw new APIError(400, 'Invalid amount')

  // run as transaction to prevent race conditions
  const res = await firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) throw new APIError(400, 'User not found')
    const user = userSnap.data() as User

    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const contractSnap = await transaction.get(contractDoc)
    if (!contractSnap.exists) throw new APIError(400, 'Invalid contract')
    const contract = contractSnap.data() as Contract

    if (user.id !== contract.creatorId)
      throw new APIError(
        400,
        'Only contract creator can award comment bounties'
      )

    const commentDoc = firestore.doc(
      `contracts/${contractId}/comments/${commentId}`
    )
    const commentSnap = await transaction.get(commentDoc)
    if (!commentSnap.exists) throw new APIError(400, 'Invalid comment')

    const comment = commentSnap.data() as Comment
    const amountAvailable = contract.openCommentBounties ?? 0
    if (amountAvailable < amount)
      throw new APIError(400, 'Insufficient open bounty balance')

    const newCommentBountyTxn = {
      fromId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      fromType: 'BANK',
      toId: comment.userId,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'COMMENT_BOUNTY',
      data: {
        contractId,
        commentId,
      },
      description: `Withdrawal M$${amount} from BANK for comment ${comment.id} bounty for contract ${contractId}`,
    } as CommentBountyWithdrawalTxn

    const result = await runTxn(transaction, newCommentBountyTxn)

    await transaction.update(
      contractDoc,
      removeUndefinedProps({
        openCommentBounties: amountAvailable - amount,
      })
    )
    await transaction.update(
      commentDoc,
      removeUndefinedProps({
        bountiesAwarded: (comment.bountiesAwarded ?? 0) + amount,
      })
    )

    return { ...result, comment, contract, user }
  })
  if (res.txn?.id) {
    const { comment, contract, user } = res
    await createBountyNotification(
      user,
      comment.userId,
      amount,
      res.txn.id,
      contract,
      comment.id
    )
  }

  return res
})

const firestore = admin.firestore()
