import * as admin from 'firebase-admin'

import { runAwardBountyTxn } from './txn/run-bounty-txn'
import { log } from './log'
import { createSupabaseDirectClient } from './supabase/init'
import { updateData } from './supabase/utils'
import { getUser } from 'shared/utils'
import { APIError } from 'common/api/utils'
import { getUserPortfolioInternal } from 'shared/get-user-portfolio-internal'
import { canSendMana } from 'common/can-send-mana'

export const awardBounty = async (props: {
  contractId: string
  fromUserId: string
  toUserId: string
  commentId: string
  prevBountyAwarded: number | undefined
  amount: number
}) => {
  const firestore = admin.firestore()
  const {
    contractId,
    fromUserId,
    toUserId,
    commentId,
    prevBountyAwarded,
    amount,
  } = props
  const user = await getUser(fromUserId)
  if (!user) throw new APIError(404, 'User not found')
  const { canSend, message } = await canSendMana(
    user,
    () => getUserPortfolioInternal(user.id),
    0
  )
  if (!canSend) {
    throw new APIError(403, message)
  }

  const txn = await firestore.runTransaction((transaction) =>
    runAwardBountyTxn(
      transaction,
      {
        fromId: contractId,
        fromType: 'CONTRACT',
        toId: toUserId,
        toType: 'USER',
        amount,
        token: 'M$',
        category: 'BOUNTY_AWARDED',
        data: { comment: commentId },
      },
      fromUserId
    )
  )

  try {
    const pg = createSupabaseDirectClient()
    await updateData(pg, 'contract_comments', 'comment_id', {
      comment_id: commentId,
      bountyAwarded: (prevBountyAwarded ?? 0) + amount,
    })
  } catch (err) {
    log.error(
      'Bounty awarded but error updating denormed bounty amount on comment. Need to manually reconocile',
      { err }
    )
  }
  return txn
}
