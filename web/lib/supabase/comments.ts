import { ContractComment } from 'common/comment'
import { run, selectJson } from 'common/supabase/utils'
import { db } from './db'

export async function getAllComments(contractId: string, maxCount: number) {
  const { data: comments } = await run(
    db
      .from('contract_comments')
      .select('data')
      .eq('contract_id', contractId)
      .order('data->>createdTime', { ascending: false } as any)
      .limit(maxCount)
  )
  return comments.map((comment) => comment.data)
}

export async function getComments(limit: number) {
  let q = selectJson(db, 'contract_comments')
  q = q
    .order('data->>createdTime', {
      ascending: false,
    } as any)
    .limit(limit)
  const { data } = await run(q)
  return data.map((c) => c.data)
}

export async function getUserComments(
  userId: string,
  limit: number,
  page: number
) {
  const { data } = await run(
    db
      .from('contract_comments')
      .select('data')
      .contains('data', { userId: userId })
      .order('data->>createdTime', { ascending: false } as any)
      .range(page * limit, page * limit + limit - 1)
  )
  if (data && data.length > 0) {
    return data.map((c) => {
      return c.data as ContractComment
    })
  } else {
    return []
  }
}

export async function getNumUserComments(userId: string) {
  const { count } = await run(
    db
      .from('contract_comments')
      .select('*', { head: true, count: 'exact' })
      .contains('data', { userId: userId })
  )
  return count as number
}
