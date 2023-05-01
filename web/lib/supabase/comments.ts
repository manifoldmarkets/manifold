import { ContractComment } from 'common/comment'
import { run, selectJson } from 'common/supabase/utils'
import { db } from './db'

export async function getComments(limit: number) {
  let q = selectJson(db, 'contract_comments')
  q = q
    .order('created_time', {
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
      .eq('user_id', userId)
      .order('created_time', { ascending: false } as any)
      .range(page * limit, page * limit + limit - 1)
  )
  if (data) {
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
      .eq('user_id', userId)
  )
  return count as number
}
