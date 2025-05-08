import { assertUnreachable } from 'common/util/types'
import { createLikeNotification } from 'shared/notifications/create-new-like-notif'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

export const addOrRemoveReaction: APIHandler<'react'> = async (props, auth) => {
  const {
    contentId,
    contentType,
    remove,
    reactionType = 'like',
    commentParentType,
  } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

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
      let commentAuthorId: string | undefined
      if (commentParentType === 'post') {
        commentAuthorId = await pg.oneOrNone(
          `select user_id from old_post_comments where comment_id = $1`,
          [contentId],
          (r) => r?.user_id
        )
      } else {
        // Default to contract comment if commentParentType is not 'post' or undefined
        commentAuthorId = await pg.oneOrNone(
          `select user_id from contract_comments where comment_id = $1`,
          [contentId],
          (r) => r?.user_id
        )
      }
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
      if (contentType === 'comment' && commentParentType !== 'post') {
        const likeCount = await pg.one(
          `select count(*) from user_reactions
           where content_id = $1 and content_type = $2 and reaction_type = $3`,
          [contentId, contentType, 'like'],
          (r) => r.count
        )
        const dislikeCount = await pg.one(
          `select count(*) from user_reactions
           where content_id = $1 and content_type = $2 and reaction_type = $3`,
          [contentId, contentType, 'dislike'],
          (r) => r.count
        )

        log('new like count ' + likeCount)
        log('new dislike count ' + dislikeCount)

        await pg.none(
          `update contract_comments set likes = $1 where comment_id = $2`,
          [likeCount, contentId]
        )
        await pg.none(
          `update contract_comments set dislikes = $1 where comment_id = $2`,
          [dislikeCount, contentId]
        )
      }
    },
  }
}
