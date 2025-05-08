import { Notification } from 'common/notification'

import { getContract, getPrivateUser, getUser } from 'shared/utils'

import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { Reaction } from 'common/reaction'
import { createSupabaseDirectClient } from 'shared/supabase/init'

import { richTextToString } from 'common/util/parse'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getCommentSafe } from 'shared/supabase/contract-comments'

export const createLikeNotification = async (reaction: Reaction) => {
  const { reaction_id, content_owner_id, user_id, content_id, content_type } =
    reaction

  const creatorPrivateUser = await getPrivateUser(content_owner_id)
  const user = await getUser(user_id)

  const pg = createSupabaseDirectClient()

  const contractId =
    content_type === 'contract'
      ? content_id
      : await pg.one(
          `select contract_id from contract_comments where comment_id = $1`,
          [content_id],
          (r) => r.contract_id
        )

  const contract = await getContract(pg, contractId)

  if (!creatorPrivateUser || !user || !contract) return

  const { sendToBrowser } = getNotificationDestinationsForUser(
    creatorPrivateUser,
    'user_liked_your_content'
  )
  if (!sendToBrowser) return

  const slug =
    `/${contract.creatorUsername}/${contract.slug}` +
    (content_type === 'comment' ? `#${content_id}` : '')

  let text = ''
  if (content_type === 'contract') {
    text = contract.question
  } else {
    const comment = await getCommentSafe(pg, content_id)
    if (!comment) return

    text = richTextToString(comment?.content)
  }

  const id = `${reaction.user_id}-${reaction_id}`
  const notification: Notification = {
    id,
    userId: content_owner_id,
    reason: 'user_liked_your_content',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: reaction_id,
    sourceType: content_type === 'contract' ? 'contract_like' : 'comment_like',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceContractId: contractId,
    sourceText: text,
    sourceSlug: slug,
    sourceTitle: contract.question,
  }
  return await insertNotificationToSupabase(notification, pg)
}
