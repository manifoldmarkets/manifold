import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getReactions: APIHandler<'comment-reactions'> = async (props) => {
  const { contentIds, contentType } = props
  const pg = createSupabaseDirectClient()

  const reactions = await pg.manyOrNone(
    `select * from user_reactions
     where content_id = ANY($1) and content_type = $2`,
    [contentIds, contentType]
  )

  return reactions
}
