import { convertContractComment } from 'common/supabase/comments'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { millisToTs } from 'common/supabase/utils'
import { ContractComment, PostComment } from 'common/comment'

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

  const params: any[] = [
    limit,
    page * limit,
    contractId,
    userId,
    replyToCommentId,
    commentId,
    afterTime ? millisToTs(afterTime) : null,
  ]

  return await pg.map(
    `
        select cc.data from contract_comments cc
          join contracts c on cc.contract_id = c.id
        where c.visibility = 'public'
          and cc.contract_id = $3 -- contractId (must be present here)
          -- userId ($4) is ignored in this branch
          and ($5 is null or cc.data->>'replyToCommentId' = $5) -- replyToCommentId
          and ($6 is null or cc.comment_id = $6)           -- commentId
          and ($7 is null or cc.created_time > $7)        -- afterTime
        order by cc.created_time desc
        limit $1
        offset $2
    `,
    params,
    convertContractComment
  )
}

export async function getPostAndContractComments(
  pg: SupabaseDirectClient,
  filters: {
    userId: string
    limit?: number
    page?: number
    afterTime?: number
  }
): Promise<(ContractComment | PostComment)[]> {
  const { userId, limit = 5000, page = 0, afterTime } = filters

  const params: any[] = [
    limit,
    page * limit,
    userId,
    afterTime ? millisToTs(afterTime) : null,
  ]

  const query = `
      SELECT * FROM (
        -- Contract Comments
        SELECT
            cc.data,
            cc.created_time,
            cc.comment_id,
            c.slug,
            c.question as title
        FROM contract_comments cc
        JOIN contracts c ON cc.contract_id = c.id
        WHERE
            c.visibility = 'public'
            AND cc.user_id = $3                   -- userId (must be present here)
            AND ($4 IS NULL OR cc.created_time > $4) -- afterTime
            
        UNION ALL

        -- Old Post Comments
        SELECT
            opc.data,
            opc.created_time,
            opc.comment_id,
            op.data->>'slug' as slug,
            op.data->>'title' as title
        FROM old_post_comments opc
        join old_posts op on opc.post_id = op.id
        WHERE
            opc.user_id = $3
            AND ($4 IS NULL OR opc.created_time > $4)
            and op.visibility = 'public'
      ) AS combined_comments
      ORDER BY created_time DESC
      LIMIT $1 -- limit
      OFFSET $2 -- offset
    `

  return await pg.map(query, params, (r) => {
    const comment = r.data as ContractComment | PostComment
    if (comment.commentType === 'post') {
      comment.postSlug = r.slug
      comment.postTitle = r.title
    }
    return comment
  })
}
