import { convertContractComment } from 'common/supabase/comments'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { millisToTs } from 'common/supabase/utils'

export async function getCommentSafe(
  pg: SupabaseDirectClient,
  commentId: string
) {
  return pg.oneOrNone(
    `select data from contract_comments where comment_id = $1`,
    [commentId],
    (r) => (r ? convertContractComment(r.data) : null)
  )
}

export async function getComment(pg: SupabaseDirectClient, commentId: string) {
  const comment = await pg.oneOrNone(
    `select data from contract_comments where comment_id = $1`,
    [commentId],
    (r) => (r ? convertContractComment(r.data) : null)
  )
  if (!comment) {
    throw new APIError(404, 'Comment not found')
  }
  return comment
}

export async function getCommentsDirect(
  pg: SupabaseDirectClient,
  filters: {
    userId?: string
    contractId?: string
    limit?: number
    page?: number
    replyToCommentId?: string
    commentId?: string
    afterTime?: number
  }
) {
  const {
    userId,
    contractId,
    limit = 5000,
    page = 0,
    replyToCommentId,
    commentId,
    afterTime,
  } = filters
  return await pg.map(
    `
        select cc.data, likes, dislikes from contract_comments cc
          join contracts on cc.contract_id = contracts.id
        where contracts.visibility = 'public'
          and ($3 is null or contract_id = $3)
          and ($4 is null or user_id = $4)
          and ($5 is null or cc.data->>'replyToCommentId' = $5)
          and ($6 is null or cc.comment_id = $6)
          and ($7 is null or cc.created_time > $7)
        order by cc.created_time desc
        limit $1
        offset $2
    `,
    [
      limit,
      page * limit,
      contractId,
      userId,
      replyToCommentId,
      commentId,
      afterTime ? millisToTs(afterTime) : null,
    ],
    (r) => convertContractComment(r)
  )
}
