import { ContractComment, PostComment } from 'common/comment'
import { Row, mapTypes, run, tsToMillis } from 'common/supabase/utils'
import { db } from './db'
import { JSONContent } from '@tiptap/core'
import { Post } from 'common/post'
import { User } from 'common/user'
import { track } from '../service/analytics'

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

export async function getAllCommentRows(limit: number) {
  const { data } = await run(
    db
      .from('contract_comments')
      .select('*')
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
      .order('created_time', { ascending: false })
  )
  return data
}

export async function getCommentsOnContract(
  contractId: string,
  limit?: number
) {
  const q = db
    .from('contract_comments')
    .select()
    .eq('contract_id', contractId)
    .order('created_time', { ascending: false })

  if (limit) {
    q.limit(limit)
  }

  const { data } = await run(q)

  return data.map(convertContractComment)
}

export async function getUserComments(
  userId: string,
  limit: number,
  page: number
) {
  const { data } = await run(
    db
      .from('contract_comments')
      .select()
      .eq('user_id', userId)
      .order('created_time', { ascending: false } as any)
      .range(page * limit, page * limit + limit - 1)
  )
  if (data) {
    return data.map(convertContractComment)
  } else {
    return []
  }
}

export async function getNumUserComments(userId: string) {
  const { count } = await run(
    db
      .from('contract_comments')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
  )
  return count as number
}

export const convertContractComment = (row: Row<'contract_comments'>) =>
  mapTypes<'contract_comments', ContractComment>(row, {
    fs_updated_time: false,
    created_time: tsToMillis as any,
  })

// post comments

export async function createPostComment(
  post: Post,
  content: JSONContent,
  user: User,
  replyToCommentId?: string
) {
  const comment: Omit<PostComment, 'createdTime' | 'id'> = {
    userId: user.id,
    content,
    userName: user.name,
    userUsername: user.username,
    userAvatarUrl: user.avatarUrl,
    replyToCommentId,
    visibility: post.visibility,
    postId: post.id,
    commentType: 'post',
  }

  await db.from('post_comments').insert({
    post_id: comment.postId,
    data: comment,
  })

  track('post message', {
    user,
    // commentId: comment.id,
    surfaceId: post.id,
    replyToCommentId,
  })
}

export async function getPostCommentRows(postId: string) {
  const { data } = await run(
    db
      .from('post_comments')
      .select()
      .eq('post_id', postId)
      .order('created_time', { ascending: false } as any)
  )
  return data
}

export async function getCommentsOnPost(postId: string) {
  const rows = await getPostCommentRows(postId)
  return rows.map(
    (c) =>
      ({
        ...(c.data as any),
        id: c.comment_id,
        createdTime: c.created_time && Date.parse(c.created_time),
      } as PostComment)
  )
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
