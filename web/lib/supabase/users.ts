import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'
import { type User } from 'common/user'
import { Period } from '../firebase/users'
import { api } from '../firebase/api'
import { DAY_MS, WEEK_MS } from 'common/util/time'
export type { DisplayUser } from 'common/api/user-types'

const defaultFields = ['id', 'name', 'username', 'avatarUrl'] as const

export async function getUserById(id: string) {
  return api('user/by-id/:id/lite', { id })
}

export async function getUserByUsername(username: string) {
  return api('user/:username/lite', { username })
}

export async function getFullUserByUsername(username: string) {
  return api('user/:username', { username })
}

export async function getFullUserById(id: string) {
  return api('user/by-id/:id', { id })
}

export async function searchUsers(prompt: string, limit: number) {
  return api('search-users', { term: prompt, limit: limit })
}

export async function getDisplayUsers(userIds: string[]) {
  // note: random order
  const { data } = await run(
    selectFrom(db, 'users', ...defaultFields, 'isBannedFromPosting').in(
      'id',
      userIds
    )
  )

  return data
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

export const getContractsCreatedProgress = async (
  userId: string,
  minTraders = 0
) => {
  const currentDate = new Date()
  const startDate = new Date()

  startDate.setMonth(startDate.getMonth() - 2)

  const startIsoString = startDate.toISOString()
  const endIsoString = currentDate.toISOString()

  const { count } = await run(
    db
      .from('public_contracts')
      .select('*', { head: true, count: 'exact' })
      .eq('creator_id', userId)
      .gte('created_time', startIsoString)
      .lt('created_time', endIsoString)
      .not('mechanism', 'eq', 'none')
      .gte('data->uniqueBettorCount', minTraders)
  )
  return count
}

export async function getRecentlyActiveUsers(limit: number) {
  const { data } = await run(
    db
      .from('users')
      .select('data')
      .gt('data->>lastBetTime', Date.now() - DAY_MS)
      .lt('data->>createdTime', Date.now() - WEEK_MS)
      .limit(limit)
  )
  console.log('getRecentlyActiveUsers', data)
  return data.map((d) => d.data as User)
}
