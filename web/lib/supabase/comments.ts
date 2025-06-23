import { run } from 'common/supabase/utils'
import { db } from './db'
import { chunk } from 'lodash'
import { convertContractComment } from 'common/supabase/comments'
import { filterDefined } from 'common/util/array'
import { PostComment } from 'common/comment'

export async function getComment(commentId: string) {
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

export async function getCommentThread(commentId: string) {
  const comment = await getComment(commentId)
  if (!comment) return null

  if (comment.replyToCommentId) {
    const [parentComment, { data }] = await Promise.all([
      getComment(comment.replyToCommentId),
      run(
        db
          .from('contract_comments')
          .select()
          .eq('contract_id', comment.contractId)
          .not('data->>replyToCommentId', 'is', null)
          .not('data->>deleted', 'eq', 'true')
          .in('data->>replyToCommentId', [comment.replyToCommentId])
          .order('created_time', { ascending: true })
      ),
    ])
    console.log('parentComment', parentComment)
    console.log('data', data)
    return filterDefined([parentComment, ...data.map(convertContractComment)])
  }

  const { data } = await run(
    db
      .from('contract_comments')
      .select()
      .eq('contract_id', comment.contractId)
      .not('data->>replyToCommentId', 'is', null)
      .not('data->>deleted', 'eq', 'true')
      .in('data->>replyToCommentId', [commentId])
      .order('created_time', { ascending: true })
  )
  console.log('comment', comment)
  console.log('data', data)
  return filterDefined([comment, ...data.map(convertContractComment)])
}

export async function getAllCommentRows(limit: number) {
  const { data } = await run(
    db
      .from('contract_comments')
      .select('*')
      .not('data->>deleted', 'eq', 'true')
      .order('created_time', {
        ascending: false,
      })
      .limit(limit)
  )
  return data
}

export async function getCommentRows(contractId: string) {
  const { data } = await run(
    db
      .from('contract_comments')
      .select()
      .eq('contract_id', contractId)
      .not('data->>deleted', 'eq', 'true')
      .order('created_time', { ascending: false })
  )
  return data
}

export async function getNewCommentRows(
  contractId: string,
  afterTime: string,
  userId?: string
) {
  let q = db
    .from('contract_comments')
    .select()
    .eq('contract_id', contractId)
    .gt('created_time', afterTime)
    .not('data->>deleted', 'eq', 'true')
    .order('created_time', { ascending: false })

  if (userId) q = q.eq('user_id', userId)

  const { data } = await run(q)
  return data
}

export async function getRecentCommentsOnContracts(
  contractIds: string[],
  limit: number
) {
  const chunks = chunk(contractIds, 100)
  const rows = await Promise.all(
    chunks.map(async (ids: string[]) => {
      const { data } = await run(
        db
          .from('contract_comments')
          .select()
          .in('contract_id', ids)
          .not('data->>deleted', 'eq', 'true')
          .limit(limit)
          .order('created_time', { ascending: false })
      )
      return data
    })
  )
  return rows.flat().map((r) => convertContractComment(r))
}

export async function getNumContractComments(contractId: string) {
  const { count } = await run(
    db
      .from('contract_comments')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
  )
  return count ?? 0
}
export async function getNumPostComments(postId: string) {
  const { count } = await run(
    db
      .from('old_post_comments')
      .select('*', { head: true, count: 'exact' })
      .eq('post_id', postId)
  )
  return count ?? 0
}

export async function getPostCommentRows(postId: string, afterTime?: string) {
  let q = db
    .from('old_post_comments')
    .select()
    .eq('post_id', postId)
    .order('created_time', { ascending: false } as any)

  if (afterTime) q = q.gt('created_time', afterTime)

  const { data } = await run(q)
  return data
}

export async function getCommentsOnPost(postId: string, afterTime?: string) {
  const rows = await getPostCommentRows(postId, afterTime)
  return rows.map(
    (c) =>
      ({
        ...(c.data as any),
        id: c.comment_id,
        createdTime: c.created_time && Date.parse(c.created_time),
      } as PostComment)
  )
}
