import { convertContractComment } from 'common/supabase/comments'
import { type SupabaseClient } from 'common/supabase/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
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

export async function getCommentsDirect(
  pg: SupabaseDirectClient,
  filters: {
    userId?: string
    contractId?: string
    limit?: number
    page?: number
    isPolitics?: boolean
  }
) {
  const { userId, contractId, limit = 5000, page = 0, isPolitics } = filters
  return await pg.map(
    `
        select cc.data from contract_comments cc
          join contracts on cc.contract_id = contracts.id
        where contracts.visibility = 'public'
          and ($3 is null or contract_id = $3)
          and ($4 is null or user_id = $4)
          and ($5 is null or contracts.is_politics = $5)
        order by cc.created_time desc
        limit $1
        offset $2
    `,
    [limit, page * limit, contractId, userId, isPolitics],
    (r) => convertContractComment(r)
  )
}
