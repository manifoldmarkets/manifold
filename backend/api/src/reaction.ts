import { reactToSocialPost } from './social-posts'
import { assertUnreachable } from 'common/util/types'
import { createLikeNotification } from 'shared/notifications/create-new-like-notif'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { writeCommentReaction } from 'shared/supabase/comment-reactions'
import { APIError, APIHandler } from './helpers/endpoint'
import { revalidatePost } from './create-post-comment'
import { getPost } from 'shared/supabase/posts'

export const addOrRemoveReaction: APIHandler<'react'> = async (
  props,
  auth,
  req
) => {
  if (props.contentType === 'social_post')
    return reactToSocialPost(props, auth, req)
  // A like on a market comment is written here whether or not the comment is
  // also on Yap. Yap reads the same rows, so the count is shared without the
  // market's reactions depending on the state of a Yap thread.
  const {
    contentId,
    contentType,
    remove,
    reactionType = 'like',
    commentParentType,
  } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  if (contentType === 'comment' && commentParentType !== 'post') {
    const inserted = await pg.tx((tx) =>
      writeCommentReaction(tx, contentId, userId, reactionType, !!remove)
    )
    if (inserted && reactionType === 'like')
      await createLikeNotification(inserted)
    return { result: { success: true }, continue: async () => {} }
  }
  const deleteReaction = async (deleteReactionType: string) => {
    await pg.none(
      `delete from user_reactions
       where user_id = $1 and content_id = $2 and content_type = $3 and reaction_type = $4`,
      [userId, contentId, contentType, deleteReactionType]
    )
  }

  if (remove) {
    await deleteReaction(reactionType)
  } else {
    let ownerId: string
    if (contentType === 'comment') {
      const commentAuthorId = await pg.oneOrNone(
        `select user_id from old_post_comments where comment_id = $1`,
        [contentId],
        (r) => r?.user_id
      )
      if (!commentAuthorId) {
        throw new APIError(404, 'Failed to find comment')
      }
      ownerId = commentAuthorId
    } else if (contentType === 'contract') {
      const creatorId = await pg.oneOrNone(
        `select creator_id from contracts where id = $1`,
        [contentId],
        (r) => r?.creator_id
      )
      if (!creatorId) {
        throw new APIError(404, 'Failed to find contract')
      }
      ownerId = creatorId
    } else if (contentType === 'post') {
      const creatorId = await pg.oneOrNone(
        `select creator_id from old_posts where id = $1`,
        [contentId],
        (r) => r?.creator_id
      )
      if (!creatorId) {
        throw new APIError(404, 'Failed to find post')
      }
      ownerId = creatorId
    } else {
      assertUnreachable(contentType)
    }

    // see if reaction exists already
    const existingReactions = await pg.manyOrNone(
      `select * from user_reactions
       where content_id = $1 and content_type = $2 and user_id = $3`,
      [contentId, contentType, userId]
    )

    if (existingReactions.length > 0) {
      const existingReactionType = existingReactions[0].reaction_type
      if (existingReactionType === reactionType) {
        return { result: { success: true }, continue: async () => {} }
      } else {
        await deleteReaction(existingReactionType)
      }
    }

    const reactionRow = await pg.one(
      `insert into user_reactions
       (content_id, content_type, content_owner_id, user_id, reaction_type)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [contentId, contentType, ownerId, userId, reactionType]
    )

    if (reactionType === 'like') {
      await createLikeNotification(reactionRow, commentParentType)
    }
  }

  return {
    result: { success: true },
    continue: async () => {
      if (contentType === 'post') {
        const post = await getPost(pg, contentId)
        if (post) {
          await revalidatePost(post)
        }
      }
    },
  }
}
