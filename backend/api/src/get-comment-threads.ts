import {
  getCommentThreads,
  getCommentThread as getCommentThreadSupabase,
} from 'shared/supabase/contract-comments'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

export const getContractCommentThreads: APIHandler<'comment-threads'> = async (
  props
) => {
  const { contractId, limit, page } = props
  const pg = createSupabaseDirectClient()
  return await getCommentThreads(pg, {
    contractId,
    limit: limit ?? 50,
    page: page ?? 0,
  })
}

export const getCommentThread: APIHandler<'comment-thread'> = async (props) => {
  const { contractId, commentId } = props
  const pg = createSupabaseDirectClient()
  return await getCommentThreadSupabase(pg, commentId, contractId)
}
