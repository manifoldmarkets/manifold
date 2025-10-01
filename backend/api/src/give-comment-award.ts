import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue, TxnData } from 'shared/txn/run-txn'
import { isProd } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { createCommentAwardNotification } from 'shared/notifications/create-comment-award-notif'

const AWARD_PRICE: Record<'plus' | 'premium' | 'crystal', number> = {
  plus: 500,
  premium: 2500,
  crystal: 10000,
}
const AWARD_PAYOUT: Record<'plus' | 'premium' | 'crystal', number> = {
  plus: 50,
  premium: 250,
  crystal: 1000,
}

export const giveCommentAward: APIHandler<'give-comment-award'> = async (
  { commentId, contractId, awardType },
  auth
) => {
  const giverId = auth.uid
  if (!giverId) throw new APIError(401, 'You must be signed in')
  const pg = createSupabaseDirectClient()

  // Get comment author from contract_comments
  const row = await pg.oneOrNone<{ user_id: string }>(
    `select user_id from contract_comments where comment_id = $1 and contract_id = $2`,
    [commentId, contractId]
  )
  if (!row?.user_id) throw new APIError(404, 'Comment not found')
  const receiverId = row.user_id
  if (receiverId === giverId)
    throw new APIError(403, 'Cannot award your own comment')

  const price = AWARD_PRICE[awardType]
  const payout = AWARD_PAYOUT[awardType]

  await pg.tx(async (tx) => {
    // Charge giver to bank
    const charge: TxnData = {
      category: 'COMMENT_AWARD_PURCHASE',
      fromType: 'USER',
      toType: 'BANK',
      token: 'M$',
      amount: price,
      fromId: giverId,
      toId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      data: { commentId, contractId, awardType },
      description: `Gave ${awardType} award`,
    }
    await runTxnInBetQueue(tx, charge)

    // Payout from bank to receiver
    const payoutTxn: TxnData = {
      category: 'COMMENT_AWARD_PAYOUT',
      fromType: 'BANK',
      toType: 'USER',
      token: 'M$',
      amount: payout,
      fromId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      toId: receiverId,
      data: { commentId, contractId, awardType, fromUserId: giverId },
      description: `Received ${awardType} award`,
    }
    await runTxnInBetQueue(tx, payoutTxn)

    // Insert award record
    await tx.none(
      `insert into comment_awards (comment_id, contract_id, giver_user_id, receiver_user_id, award_type, amount_mana)
       values ($1, $2, $3, $4, $5, $6)`,
      [commentId, contractId, giverId, receiverId, awardType, payout]
    )
  })

  // Notify receiver (outside transaction)
  await createCommentAwardNotification(
    pg,
    commentId,
    contractId,
    awardType,
    payout,
    giverId,
    receiverId
  )

  return { success: true }
}
