import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getCommentSafe } from 'shared/supabase/contract-comments'

export const getComment: APIHandler<'get-comment'> = async (props) => {
  const { commentId } = props
  const pg = createSupabaseDirectClient()
  
  const comment = await getCommentSafe(pg, commentId)
  
  return { comment }
}