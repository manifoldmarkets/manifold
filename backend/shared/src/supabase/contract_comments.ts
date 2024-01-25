import { convertContractComment } from 'common/supabase/comments'
import { type SupabaseClient, run } from 'common/supabase/utils'
import { APIError } from 'common/api/utils'

export async function getCommentSafe(db: SupabaseClient, commentId: string) {
  const res = await db
    .from('contract_comments')
    .select()
    .eq('comment_id', commentId)
    .single()

  if (res.error) {
    return null
  }

  return convertContractComment(res.data)
}

export async function getComment(db: SupabaseClient, commentId: string) {
  const { data, error } = await db
    .from('contract_comments')
    .select()
    .eq('comment_id', commentId)

  if (error) {
    throw new APIError(500, 'Failed to fetch comment: ' + error.message)
  }
  if (!data.length) {
    throw new APIError(404, 'Comment not found')
  }
  return convertContractComment(data[0])
}

export async function getComments(
  db: SupabaseClient,
  filters: {
    userId?: string
    contractId?: string
    limit?: number
    page?: number
  }
) {
  const { userId, contractId, limit, page = 0 } = filters

  let q = db
    .from('contract_comments')
    .select()
    .eq('visibility', 'public')
    .order('created_time', { ascending: false } as any)

  if (userId) q = q.eq('user_id', userId)
  if (contractId) q = q.eq('contract_id', contractId)
  if (limit) q = q.range(page * limit, (page + 1) * limit - 1)

  const res = await run(q)
  return res.data.map(convertContractComment)
}
