import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'
import { uniqBy } from 'lodash'
import { User } from 'common/user'
import { Period } from '../firebase/users'

export type UserSearchResult = Awaited<ReturnType<typeof searchUsers>>[number]

const defaultFields = ['id', 'name', 'username', 'avatarUrl'] as const

export async function getUserByUsername(username: string) {
  const { data } = await run(
    selectFrom(db, 'users', ...defaultFields).eq('username', username)
  )
  if (data.length === 0) return null

  return data[0] as User
}

export async function searchUsers(
  prompt: string,
  limit: number,
  extraFields?: (keyof User)[]
) {
  const fields = [...defaultFields, ...(extraFields ?? [])]
  if (prompt === '') {
    const { data } = await run(
      selectFrom(db, 'users', ...fields)
        .order('data->creatorTraders->allTime', { ascending: false } as any)
        .limit(limit)
    )
    return data
  }

  const { data } = await db.rpc('search_users', { query: prompt, count: limit })

  return data?.map((d) => d.data as User) ?? []
}

// leaderboards

export async function getProfitRank(profit: number, period: Period) {
  const { count } = await run(
    db
      .from('users')
      .select('*', { head: true, count: 'exact' })
      .gt(`data->profitCached->${period}`, profit)
  )
  return count + 1
}

export async function getCreatorRank(traders: number, period: Period) {
  const { count } = await run(
    db
      .from('users')
      .select('*', { head: true, count: 'exact' })
      .gt(`data->creatorTraders->${period}`, traders)
  )
  return count + 1
}

export async function getTopTraders(period: Period) {
  const { data } = await run(
    selectFrom(db, 'users', ...defaultFields, 'profitCached', 'creatorTraders')
      .order(`data->profitCached->${period}`, {
        ascending: false,
      } as any)
      .limit(21) // add extra for @acc
  )
  return data
}

export async function getTopCreators(period: Period) {
  const { data } = await run(
    selectFrom(db, 'users', ...defaultFields, 'profitCached', 'creatorTraders')
      .order(`data->creatorTraders->${period}`, {
        ascending: false,
      } as any)
      .limit(20)
  )
  return data
}

export async function getTopUserCreators(
  userId: string,
  excludedUserIds: string[],
  limit: number
) {
  const { data } = await run(
    db.rpc('top_creators_for_user', {
      uid: userId,
      excluded_ids: excludedUserIds,
      limit_n: limit,
    })
  )
  return data
}

export const getTotalContractsCreated = async (userId: string) => {
  const { count } = await run(
    db
      .from('public_contracts')
      .select('*', { head: true, count: 'exact' })
      .eq('creator_id', userId)
  )
  return count
}
