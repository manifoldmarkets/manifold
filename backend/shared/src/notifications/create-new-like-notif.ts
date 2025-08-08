import { Notification } from 'common/notification'

import { getContract, getPrivateUser, getUser } from 'shared/utils'

import { Reaction } from 'common/reaction'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createSupabaseDirectClient } from 'shared/supabase/init'

import { APIError } from 'common/api/utils'
import { PostComment } from 'common/comment'
import { richTextToString } from 'common/util/parse'
import { getCommentSafe } from 'shared/supabase/contract-comments'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getPost } from 'shared/supabase/posts'

export const createLikeNotification = async (
  reaction: Reaction,
  commentParentType?: 'post'
) => {
  const { reaction_id, content_owner_id, user_id, content_id, content_type } =
    reaction
  const creatorPrivateUser = await getPrivateUser(content_owner_id)
  const user = await getUser(user_id)
  if (!creatorPrivateUser || !user) return

  const pg = createSupabaseDirectClient()
  if (commentParentType === 'post') {
    const comment = await pg.oneOrNone(
      `SELECT data FROM old_post_comments WHERE comment_id = $1`,
      [content_id],
      (row) => row.data as PostComment
    )
    if (!comment) throw new APIError(404, 'Comment not found')
    const post = await getPost(pg, comment.postId)
    if (!post) throw new APIError(404, 'Post not found')
    const { sendToBrowser } = getNotificationDestinationsForUser(
      creatorPrivateUser,
      'user_liked_your_content'
    )

    if (!sendToBrowser) return
    const id = `${reaction.user_id}-${content_id}-like`
    const notification: Notification = {
      id,
      userId: content_owner_id,
      reason: 'user_liked_your_content',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: reaction_id,
      sourceType: 'post_comment_like',
      sourceUpdateType: 'created',
      sourceUserName: user.name,
      sourceUserUsername: user.username,
      sourceUserAvatarUrl: user.avatarUrl,
      sourceText: richTextToString(comment.content).slice(0, 200),
      sourceSlug: `post/${post.slug}#${comment.id}`,
      sourceTitle: post.title,
    }
    return await insertNotificationToSupabase(notification, pg)
  } else if (content_type === 'post') {
    const post = await getPost(pg, content_id)
    if (!post) throw new APIError(404, 'Post not found')
    const { sendToBrowser } = getNotificationDestinationsForUser(
      creatorPrivateUser,
      'user_liked_your_content'
    )

    if (!sendToBrowser) return
    const id = `${reaction.user_id}-${content_id}-like`
    const notification: Notification = {
      id,
      userId: content_owner_id,
      reason: 'user_liked_your_content',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: reaction_id,
      sourceType: 'post_like',
      sourceUpdateType: 'created',
      sourceUserName: user.name,
      sourceUserUsername: user.username,
      sourceUserAvatarUrl: user.avatarUrl,
      sourceText: richTextToString(post.content).slice(0, 200),
      sourceSlug: `post/${post.slug}`,
      sourceTitle: post.title,
    }
    return await insertNotificationToSupabase(notification, pg)
  } else {
    const contractId =
      content_type === 'contract'
        ? content_id
        : await pg.one(
            `select contract_id from contract_comments where comment_id = $1`,
            [content_id],
            (r) => r.contract_id
          )

    const contract = await getContract(pg, contractId)

    if (!contract) return

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

    const id = `${reaction.user_id}-${content_id}-like`
    const notification: Notification = {
      id,
      userId: content_owner_id,
      reason: 'user_liked_your_content',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: reaction_id,
      sourceType:
        content_type === 'contract' ? 'contract_like' : 'comment_like',
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
}
