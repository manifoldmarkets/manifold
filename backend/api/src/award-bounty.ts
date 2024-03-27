import { type APIHandler } from './helpers/endpoint'
import { createBountyAwardedNotification } from 'shared/create-notification'
import { getContract } from 'shared/utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { getComment } from 'shared/supabase/contract_comments'
import { awardBounty as doAwardBounty } from 'shared/bounty'

export const awardBounty: APIHandler<
  'market/:contractId/award-bounty'
> = async (props, auth) => {
  const { contractId, commentId, amount } = props

  const db = createSupabaseClient()
  const comment = await getComment(db, commentId)

  const txn = await doAwardBounty({
    contractId,
    fromUserId: auth.uid,
    toUserId: comment.userId,
    commentId,
    prevBountyAwarded: comment.bountyAwarded,
    amount,
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
}
