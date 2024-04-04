import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { db } from './db'
import { DAY_MS, WEEK_MS } from 'common/util/time'
import { DisplayUser } from 'web/lib/supabase/users'

export async function getUser(userId: string) {
  const { data: user } = await run(
    db.from('users').select('data').eq('id', userId)
  )
  if (user && user.length > 0) {
    return user[0].data as User
  } else {
    return null
  }
}
export async function getDisplayUser(userId: string) {
  const { data: user } = await run(
    db
      .from('users')
      .select('data->>avatarUrl,name,username')
      .eq('id', userId)
      .limit(1)
  )
  if (user && user.length > 0) {
    return { ...user[0], id: userId } as DisplayUser
  } else {
    return null
  }
}

export async function getUsers(userIds: string[]) {
  const { data } = await run(db.from('users').select('data').in('id', userIds))
  if (data && data.length > 0) {
    const userObj = Object.fromEntries(
      data.map((d) => [(d.data as any)?.id, d.data])
    )
    return userIds.map((id) => (userObj[id] ?? null) as User | null)
  } else {
    return []
  }
}
const BLANK_TOPIC = ''
export async function getUserInterestTopics(userId: string) {
  const { data } = await run(
    db.from('user_topics').select('topics').eq('user_id', userId).limit(1)
  )
  if (data && data.length > 0) {
    return data[0].topics?.filter((t) => t !== BLANK_TOPIC)
  } else {
    return []
  }
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
