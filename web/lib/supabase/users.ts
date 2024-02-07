import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'
import { User } from 'common/user'
import { Period } from '../firebase/users'
import { api } from '../firebase/api'

export type UserDisplay = {
  id: string
  name: string
  username: string
  avatarUrl?: string
}

const defaultFields = ['id', 'name', 'username', 'avatarUrl'] as const

export type DisplayUser = Pick<User, (typeof defaultFields)[number]>

export async function getUserById(id: string) {
  const { data } = await run(
    selectFrom(db, 'users', ...defaultFields).eq('id', id)
  )
  if (data.length === 0) return null

  return data[0]
}

export async function getUserByUsername(username: string) {
  const { data } = await run(
    selectFrom(db, 'users', ...defaultFields).eq('username', username)
  )
  if (data.length === 0) return null

  return data[0]
}

export async function getFullUserByUsername(username: string) {
  const { data } = await run(
    db.from('users').select('data').eq('username', username)
  )
  if (data.length === 0) return null

  return data[0].data as User
}

export async function getFullUserById(id: string) {
  const { data } = await run(db.from('users').select('data').eq('id', id))
  if (data.length === 0) return null

  return data[0].data as User
}

export async function searchUsers(prompt: string, limit: number) {
  const users = await api('search-users', { term: prompt, limit: limit })
  return users
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
      .limit(25) // add extra for @acc, excluded users
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
