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

  const pg = createSupabaseDirectClient()
  await pg
    .tx(async (tx) => {
      const txn = await runAwardBountyTxn(
        tx,
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

      await updateData(tx, 'contract_comments', 'comment_id', {
        comment_id: commentId,
        bountyAwarded: (prevBountyAwarded ?? 0) + amount,
      })

      return txn
    })
    .catch((err) => {
      log.error(
        'Bounty awarded but error updating denormed bounty amount on comment. Need to manually reconocile',
        { err: err }
      )
      throw err
    })
}
