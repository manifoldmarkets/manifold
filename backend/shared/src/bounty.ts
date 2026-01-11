import { runAwardBountyTxn } from './txn/run-bounty-txn'
import { createSupabaseDirectClient } from './supabase/init'
import { updateData } from './supabase/utils'
import { getContractSupabase, getUser } from 'shared/utils'
import { APIError } from 'common/api/utils'
import { canSendMana } from 'common/can-send-mana'
import { UserBan } from 'common/user'

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

  const pg = createSupabaseDirectClient()

  const user = await getUser(fromUserId)
  if (!user) throw new APIError(404, 'User not found')

  // Fetch bans for the user
  const userBans = await pg.manyOrNone<UserBan>(
    `SELECT * FROM user_bans WHERE user_id = $1 AND ended_at IS NULL AND (end_time IS NULL OR end_time > now())`,
    [fromUserId]
  )

  const { canSend, message } = await canSendMana(user, userBans)
  if (!canSend) {
    throw new APIError(403, message)
  }

  const contract = await getContractSupabase(contractId)

  if (!contract) throw new APIError(404, 'Contract not found')
  if (
    contract.mechanism !== 'none' ||
    contract.outcomeType !== 'BOUNTIED_QUESTION'
  ) {
    throw new APIError(
      400,
      'Invalid contract, only bountied questions are supported'
    )
  }

  if (contract.creatorId !== fromUserId) {
    throw new APIError(
      403,
      'A bounty can only be given by the creator of the question'
    )
  }

  // we check this again within the firebase transaction
  if (contract.bountyLeft < amount) {
    throw new APIError(
      400,
      `There is only M${contract.bountyLeft} of bounty left to award, which is less than M${amount}`
    )
  }

  return await pg.tx(async (tx) => {
    await updateData(tx, 'contract_comments', 'comment_id', {
      comment_id: commentId,
      bountyAwarded: (prevBountyAwarded ?? 0) + amount,
    })

    return await runAwardBountyTxn(tx, {
      fromId: contractId,
      fromType: 'CONTRACT',
      toId: toUserId,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'BOUNTY_AWARDED',
      data: { comment: commentId },
    })
  })
}
