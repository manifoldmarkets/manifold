import { Notification } from 'common/notification'
import { getContract, getPrivateUser, getUser } from 'shared/utils'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { richTextToString } from 'common/util/parse'
import { getCommentSafe } from 'shared/supabase/contract-comments'

export const createCommentAwardNotification = async (
  pg: SupabaseDirectClient,
  commentId: string,
  contractId: string,
  awardType: 'plus' | 'premium' | 'crystal',
  payoutAmount: number,
  giverId: string,
  receiverId: string
) => {
  const receiver = await getPrivateUser(receiverId)
  const giver = await getUser(giverId)
  if (!receiver || !giver) return

  const { sendToBrowser } = getNotificationDestinationsForUser(
    receiver,
    'user_liked_your_content' // Reuse this preference for awards
  )
  if (!sendToBrowser) return

  const contract = await getContract(pg, contractId)
  if (!contract) return

  const comment = await getCommentSafe(pg, commentId)
  if (!comment) return

  const slug = `/${contract.creatorUsername}/${contract.slug}#${commentId}`
  const commentText = richTextToString(comment.content)

  // Map award type to icon
  const awardIconMap = {
    plus: '/market-tiers/Plus.svg',
    premium: '/market-tiers/Premium.svg',
    crystal: '/market-tiers/Crystal.svg',
  }

  const awardNameMap = {
    plus: 'Comment award',
    premium: 'Premium comment award',
    crystal: 'Crystal comment award',
  }

  const id = `${giverId}-${commentId}-award-${awardType}-${Date.now()}`
  const notification: Notification = {
    id,
    userId: receiverId,
    reason: 'user_liked_your_content',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: commentId,
    sourceType: 'comment_award',
    sourceUpdateType: 'created',
    sourceUserName: giver.name,
    sourceUserUsername: giver.username,
    sourceUserAvatarUrl: giver.avatarUrl,
    sourceContractId: contractId,
    sourceText: commentText.slice(0, 200),
    sourceSlug: slug,
    sourceTitle: contract.question,
    data: {
      awardType,
      payoutAmount,
      awardIcon: awardIconMap[awardType],
      awardName: awardNameMap[awardType],
    },
  }

  return await pg.none(
    `insert into user_notifications
     (user_id, notification_id, data)
     values ($1, $2, $3)
     on conflict (user_id, notification_id) do nothing`,
    [receiverId, id, notification]
  )
}
