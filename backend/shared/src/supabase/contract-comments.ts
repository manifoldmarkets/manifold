import { convertContractComment } from 'common/supabase/comments'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { millisToTs } from 'common/supabase/utils'
import { Comment } from 'common/comment'

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

export async function getCommentsDirect<T extends Comment>(
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
): Promise<T[]> {
  const {
    userId,
    contractId,
    limit = 5000,
    page = 0,
    replyToCommentId,
    commentId,
    afterTime,
  } = filters

  let query: string
  const params: any[] = [
    limit,
    page * limit,
    contractId,
    userId,
    replyToCommentId,
    commentId,
    afterTime ? millisToTs(afterTime) : null,
  ]

  // Combine contract comments and old post comments for a user's page
  if (userId) {
    query = `
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
            AND ($3 IS NULL OR cc.contract_id = $3) -- contractId (can be null when querying by user)
            AND cc.user_id = $4                   -- userId (must be present here)
            AND ($5 IS NULL OR cc.data->>'replyToCommentId' = $5) -- replyToCommentId
            AND ($6 IS NULL OR cc.comment_id = $6)   -- commentId
            AND ($7 IS NULL OR cc.created_time > $7) -- afterTime

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
             opc.user_id = $4
            AND ($7 IS NULL OR opc.created_time > $7)
            and op.visibility = 'public'
      ) AS combined_comments
      ORDER BY created_time DESC
      LIMIT $1 -- limit
      OFFSET $2 -- offset
    `
  } else {
    if (!contractId) {
      throw new APIError(400, 'Either contractId or userId must be provided')
    }
    query = `
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
    `
  }

  return await pg.map(query, params, (r) => {
    const comment = r.data as T
    if (comment.commentType === 'post') {
      comment.postSlug = r.slug
      comment.postTitle = r.title
    }
    return comment
  })
}
