import { assertUnreachable } from 'common/util/types'
import { createLikeNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { hideComment } from './hide-comment'
import { updateData } from 'shared/supabase/utils'
import { getComment } from 'shared/supabase/contract-comments'

export const addOrRemoveReaction: APIHandler<'react'> = async (props, auth) => {
  const { contentId, contentType, remove, reactionType = 'like' } = props
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
    // get the id of the person this content belongs to, to denormalize the owner
    let ownerId: string
    if (contentType === 'comment') {
      const userId = await pg.oneOrNone(
        `select user_id from contract_comments where comment_id = $1`,
        [contentId],
        (r) => r?.user_id
      )

      if (!userId) {
        throw new APIError(404, 'Failed to find comment')
      }
      ownerId = userId
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
      // if it's the same reaction type, do nothing
      if (existingReactionType === reactionType) {
        return { result: { success: true }, continue: async () => {} }
      } else {
        // otherwise, remove the other reaction type
        await deleteReaction(existingReactionType)
      }
    }

    // actually do the insert
    const reactionRow = await pg.one(
      `insert into user_reactions
       (content_id, content_type, content_owner_id, user_id, reaction_type)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [contentId, contentType, ownerId, userId, reactionType]
    )

    if (reactionType === 'like') {
      await createLikeNotification(reactionRow)
    }
  }

  return {
    result: { success: true },
    continue: async () => {
      if (contentType === 'comment') {
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

        const comment = await getComment(pg, contentId)

        if (
          // dislikeCount > 10 &&
          // dislikeCount / (likeCount + dislikeCount) > 0.8
          dislikeCount > 0
        ) {
          //hide comment if above a certain threshold
          await updateData(pg, 'contract_comments', 'comment_id', {
            comment_id: contentId,
            hidden: true,
            hiddenTime: Date.now(),
            hiderId: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2',
          })
        } else if (comment.hidden) {
          await updateData(pg, 'contract_comments', 'comment_id', {
            comment_id: contentId,
            hidden: false,
          })
        }
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
