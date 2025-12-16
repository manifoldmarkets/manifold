import { APIError } from 'common/api/utils'
import { ContractComment, PostComment } from 'common/comment'
import { convertContractComment } from 'common/supabase/comments'
import { millisToTs } from 'common/supabase/utils'
import { SupabaseDirectClient } from 'shared/supabase/init'

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

export async function getCommentThreads(
  pg: SupabaseDirectClient,
  filters: {
    contractId: string
    limit: number
    page: number
  }
) {
  const { contractId, limit, page } = filters

  const allComments = await pg.map(
    `
    with parent_comments as (
      select cc.data, cc.likes, cc.comment_id from contract_comments cc
      where cc.contract_id = $1
      and (cc.data->>'replyToCommentId' is null)
      and (cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')
      order by cc.created_time desc
      limit $2
      offset $3
    )
    select * from parent_comments
    union all
    select cc.data, cc.likes, cc.comment_id from contract_comments cc
    where cc.contract_id = $1
    and (cc.data->>'replyToCommentId' in (select comment_id from parent_comments))
    and (cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')
    `,
    [contractId, limit, page * limit],
    convertContractComment
  )

  const parentComments = allComments.filter((c) => !c.replyToCommentId)
  const replyComments = allComments.filter((c) => c.replyToCommentId)
  console.log('parentComments', parentComments.length)
  console.log('replyComments', replyComments.length)

  return { parentComments, replyComments }
}

export async function getCommentThread(
  pg: SupabaseDirectClient,
  commentId: string,
  contractId: string
) {
  const comment = await pg.oneOrNone(
    `
      select cc.data, cc.likes from contract_comments cc
      where cc.comment_id = $1 and cc.contract_id = $2
    `,
    [commentId, contractId],
    convertContractComment
  )
  if (!comment) {
    return {
      parentComment: null,
      replyComments: [],
      parentComments: [],
      nextParentComments: [],
      nextReplyComments: [],
    }
  }

  const parentId = comment.replyToCommentId ?? comment.id
  const parentComment =
    comment.replyToCommentId && comment.replyToCommentId !== comment.id
      ? await pg.oneOrNone(
          `
      select cc.data, cc.likes from contract_comments cc
      where cc.comment_id = $1 and cc.contract_id = $2
    `,
          [parentId, contractId],
          convertContractComment
        )
      : comment

  if (!parentComment) {
    return {
      parentComment: null,
      replyComments: [],
      parentComments: [],
      nextParentComments: [],
      nextReplyComments: [],
    }
  }

  const results = await pg.multi(
    `
      select cc.data, cc.likes from contract_comments cc
      where cc.contract_id = $1
      and (cc.data->>'replyToCommentId' = $2)
      and (cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')
      order by cc.created_time asc;
      select cc.data, cc.likes from contract_comments cc
      where cc.contract_id = $1
      and (cc.data->>'replyToCommentId' is null)
      and (cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')
      and cc.created_time > $3
      order by cc.created_time desc;
      select cc.data, cc.likes from contract_comments cc
      where cc.contract_id = $1
      and (cc.data->>'replyToCommentId' is null)
      and (cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')
      and cc.created_time < $3
      order by cc.created_time desc
      limit 3;
    `,
    [contractId, parentId, millisToTs(parentComment.createdTime)]
  )
  const replyComments = results[0].map(convertContractComment)
  const parentComments = results[1].map(convertContractComment)
  const nextParentComments = results[2].map(convertContractComment)

  const nextReplyComments =
    nextParentComments.length > 0
      ? await pg.map(
          `
      select cc.data, cc.likes from contract_comments cc
      where cc.contract_id = $1
      and (cc.data->>'replyToCommentId' in ($2:csv))
      and (cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')
      order by cc.created_time asc
    `,
          [contractId, nextParentComments.map((c) => c.id)],
          convertContractComment
        )
      : []

  return {
    parentComment,
    replyComments,
    parentComments,
    nextParentComments,
    nextReplyComments,
  }
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
    order?: 'likes' | 'newest' | 'oldest'
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
    order = 'newest',
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
  const orderBy =
    order === 'likes'
      ? 'cc.likes desc'
      : !order || order === 'newest'
      ? 'cc.created_time desc'
      : 'cc.created_time asc'

  return await pg.map(
    `
        select cc.data, cc.likes from contract_comments cc
          join contracts c on cc.contract_id = c.id
        where c.visibility = 'public'
          and ($3 is null or contract_id = $3)
          and ($4 is null or user_id = $4)
          and ($5 is null or cc.data->>'replyToCommentId' = $5) 
          and ($6 is null or cc.comment_id = $6)          
          and ($7 is null or cc.created_time > $7)
          and (cc.data->>'deleted' is null or cc.data->>'deleted' = 'false')        
        order by ${orderBy}
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
    term?: string
  }
): Promise<(ContractComment | PostComment)[]> {
  const { userId, limit = 5000, page = 0, afterTime, term } = filters

  const params: any[] = [
    limit,
    page * limit,
    userId,
    afterTime ? millisToTs(afterTime) : null,
    term ? `%${term}%` : null,
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
            AND (cc.data->>'deleted' IS NULL OR cc.data->>'deleted' = 'false')
            AND ($5 IS NULL OR EXISTS (
              SELECT 1 FROM jsonb_path_query(cc.data->'content', '$.**.text') AS txt
              WHERE txt #>> '{}' ILIKE $5
            ))
            
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
            AND ($5 IS NULL OR EXISTS (
              SELECT 1 FROM jsonb_path_query(opc.data->'content', '$.**.text') AS txt
              WHERE txt #>> '{}' ILIKE $5
            ))
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
