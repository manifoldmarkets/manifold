import { APIError, APIHandler } from './helpers/endpoint'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/monitoring/log'

export const followPost: APIHandler<'follow-post'> = async (props, auth) => {
  const { postId, follow } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  try {
    if (follow) {
      // Add a new follow relationship
      await followPostInternal(pg, postId, userId)
    } else {
      // Remove the follow relationship
      await pg.none(
        'DELETE FROM post_follows WHERE post_id = $1 AND user_id = $2',
        [postId, userId]
      )
    }

    // We could potentially broadcast this change via websockets if live updates on the button are needed immediately for other users viewing the same post.
    // For now, the button's local state handles the immediate feedback for the acting user.

    return { success: true }
  } catch (error) {
    log.error('Failed to update post follow status', {
      error,
      postId,
      userId,
      follow,
    })
    throw new APIError(500, 'Failed to update post follow status')
  }
}

export const followPostInternal = async (
  pg: SupabaseDirectClient,
  postId: string,
  userId: string
) => {
  await pg.none(
    'INSERT INTO post_follows (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING',
    [postId, userId]
  )
}
