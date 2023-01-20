import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'
import { uniqBy } from 'lodash'

export type UserSearchResult = Awaited<ReturnType<typeof searchUsers>>[number]

export async function searchUsers(prompt: string, limit: number) {
  if (prompt === '') {
    const { data } = await run(
      selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
        .order('data->followerCountCached', { ascending: false } as any)
        .limit(limit)
    )
    return data
  }

  const { data: exactData } = await run(
    selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
      .or(`data->>username.ilike.${prompt},data->>name.ilike.${prompt}`)
      .limit(limit)
  )

  if (exactData.length === limit) {
    return exactData
  }

  const { data: similarData } = await run(
    selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
      .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
      .order('data->lastBetTime', {
        ascending: false,
        nullsFirst: false,
      } as any)
      .limit(limit)
  )
  return uniqBy([...exactData, ...similarData], 'id').slice(0, limit)
}
