import { sumBy } from 'lodash'
import { BountiedQuestionContract } from 'common/contract'
import { getAutoBountyPayoutPerHour } from 'common/bounty'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { awardBounty } from 'shared/bounty'

export const autoAwardBounty = async () => {
  const pg = createSupabaseDirectClient()

  const contracts = await pg.map(
    `select data from contracts
    where
      outcome_type = 'BOUNTIED_QUESTION'
      and (data->>'bountyLeft')::numeric > 1
      and data->>'isAutoBounty' = 'true'
      and created_time < now() - interval '1 hour'
  `,
    [],
    (r) => r.data as BountiedQuestionContract
  )

  console.log(
    'Auto awarding bounties for contracts:',
    contracts.map((c) => c.question)
  )

  for (const contract of contracts) {
    const totalPayout = getAutoBountyPayoutPerHour(contract)
    console.log('total payout', totalPayout)
    const comments = await pg.map(
      `select comment_id, user_id, likes, (data->>'bountyAwarded')::numeric as bountyAwarded
      from contract_comments
      where contract_id = $1
      and likes > 0`,
      [contract.id],
      (r) => ({
        likes: Number(r.likes),
        commentId: r.comment_id as string,
        userId: r.user_id as string,
        bountyAwarded: Number(r.bountyAwarded ?? 0),
      })
    )
    console.log('comments', comments)
    const totalLikes = sumBy(comments, 'likes')

    for (const comment of comments) {
      const { likes, commentId, userId, bountyAwarded } = comment
      const amount = (likes / totalLikes) * totalPayout
      await awardBounty({
        contractId: contract.id,
        fromUserId: contract.creatorId,
        toUserId: userId,
        commentId,
        prevBountyAwarded: bountyAwarded,
        amount,
      })
    }
  }

  console.log('Done awarding bounties')
}
