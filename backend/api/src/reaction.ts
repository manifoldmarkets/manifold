import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { createLikeNotification } from 'shared/create-notification'
import { assertUnreachable } from 'common/util/types'

export const addOrRemoveReaction: APIHandler<'react'> = async (
  props,
  auth,
  { log, logError }
) => {
  const { contentId, contentType, remove } = props
  const userId = auth.uid

  const db = createSupabaseClient()

  if (remove) {
    const { error } = await db
      .from('user_reactions')
      .delete()
      .eq('user_id', userId)
      .eq('content_id', contentId)
      .eq('content_type', contentType)

    if (error) {
      throw new APIError(500, 'Failed to remove reaction: ' + error.message)
    }

    // otherwise add
  } else {
    // get the id of the person this content belongs to, to denormalize the owner
    let ownerId: string
    if (contentType === 'comment') {
      const { data, error } = await db
        .from('contract_comments')
        .select()
        .eq('comment_id', contentId)
        .single()

      if (error) {
        throw new APIError(404, 'Failed to find comment: ' + error.message)
      }

      ownerId = data.user_id
    } else if (contentType === 'contract') {
      const { data, error } = await db
        .from('contracts')
        .select('creator_id')
        .eq('id', contentId)
        .single()

      if (error) {
        throw new APIError(404, 'Failed to find contract: ' + error.message)
      }

      if (!data?.creator_id) {
        logError('Failed to send like notification. Contract has no creator', {
          contentId,
        })
        return
      }

      ownerId = data.creator_id
    } else {
      assertUnreachable(contentType)
    }

    // see if reaction exists already
    const existing = await db
      .from('user_reactions')
      .select()
      .eq('content_id', contentId)
      .eq('content_type', contentType)
      .eq('user_id', userId)

    if (existing.data?.length) {
      log('Reaction already exists, do nothing')
      return
    }

    // actually do the insert
    const { data, error } = await db
      .from('user_reactions')
      .insert({
        content_id: contentId,
        content_type: contentType,
        content_owner_id: ownerId,
        user_id: userId,
        fs_updated_time: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      throw new APIError(500, 'Failed to add reaction: ' + error.message)
    }

    await createLikeNotification(data)
  }
}
