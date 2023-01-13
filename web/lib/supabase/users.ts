import { db } from './db'
import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { uniqBy } from 'lodash'

export type SearchUserInfo = Pick<
  User,
  'id' | 'name' | 'username' | 'avatarUrl'
>

export async function searchUsers(prompt: string, limit: number) {
  if (prompt === '') {
    const { data } = await run(
      db
        .from('users')
        .select('id, data->name, data->username, data->avatarUrl')
        .order('data->followerCountCached', { ascending: false } as any)
        .limit(limit)
    )
    return data
  }

  const { data: exactData } = await run(
    db
      .from('users')
      .select('id, data->name, data->username, data->avatarUrl')
      .or(`data->>username.ilike.${prompt},data->>name.ilike.${prompt}`)
      .limit(limit)
  )

  if (exactData.length === limit) {
    return exactData
  }

  const { data: similarData } = await run(
    db
      .from('users')
      .select('id, data->name, data->username, data->avatarUrl')
      .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
      .order('data->lastBetTime', {
        ascending: false,
        nullsFirst: false,
      } as any)
      .limit(limit)
  )
  return uniqBy([...exactData, ...similarData], 'id').slice(0, limit)
}
