import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Reaction } from 'common/reaction'

export const getCommentVotes: APIHandler<'get-comment-votes'> = async (
  props
) => {
  const { contentType, commentId } = props

  const pg = createSupabaseDirectClient()

  const reactions = await pg.manyOrNone<Reaction>(
    `SELECT * FROM user_reactions WHERE content_id = $1 AND content_type = $2`,
    [commentId, contentType]
  )

  return reactions
}
