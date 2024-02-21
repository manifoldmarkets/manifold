import * as admin from 'firebase-admin'
import { runAwardBountyTxn } from 'shared/txn/run-bounty-txn'
import { type APIHandler } from './helpers/endpoint'
import { createBountyAwardedNotification } from 'shared/create-notification'
import { getContract } from 'shared/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getComment } from 'shared/supabase/contract_comments'
import { updateData } from 'shared/supabase/utils'

export const awardBounty: APIHandler<
  'market/:contractId/award-bounty'
> = async (props, auth, { logError }) => {
  const { contractId, commentId, amount } = props

  const db = createSupabaseClient()
  const comment = await getComment(db, commentId)

  // run as transaction to prevent race conditions
  const txn = await firestore.runTransaction((transaction) =>
    runAwardBountyTxn(
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
  )

  try {
    const pg = createSupabaseDirectClient()
    await updateData(pg, 'contract_comments', 'comment_id', {
      comment_id: commentId,
      bountyAwarded: (comment.bountyAwarded ?? 0) + amount,
    })
  } catch (e) {
    logError(
      'Bounty awarded but error updating denormed bounty amount on comment. Need to manually reconocile'
    )
    logError(e)
  }

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
}

const firestore = admin.firestore()
