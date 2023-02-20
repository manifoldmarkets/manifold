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

  const [{ data: exactData }, { data: prefixData }, { data: containsData }] =
    await Promise.all([
      run(
        selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
          .or(`data->>username.ilike.${prompt},data->>name.ilike.${prompt}`)
          .order('data->followerCountCached', { ascending: false } as any)
          .limit(limit)
      ),
      run(
        selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
          .or(`data->>username.ilike.${prompt}%,data->>name.ilike.${prompt}%`)
          .order('data->lastBetTime', {
            ascending: false,
            nullsFirst: false,
          } as any)
          .limit(limit)
      ),
      run(
        selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
          .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
          .order('data->lastBetTime', {
            ascending: false,
            nullsFirst: false,
          } as any)
          .limit(limit)
      ),
    ])

  return uniqBy([...exactData, ...prefixData, ...containsData], 'id').slice(
    0,
    limit
  )
}

export async function searchUsersExcludingArray(
  prompt: string,
  limit: number,
  excludingArray: string[]
) {
  const excludingArrayString =
    '(' + excludingArray.map((item) => `${item},`) + ')'
  if (prompt === '') {
    const { data } = await run(
      selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
        .not('id', 'in', excludingArrayString)
        .order('data->followerCountCached', { ascending: false } as any)
        .limit(limit)
    )
    return data
  }

  const [{ data: exactData }, { data: prefixData }, { data: containsData }] =
    await Promise.all([
      run(
        selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
          .not('id', 'in', excludingArrayString)
          .or(`data->>username.ilike.${prompt},data->>name.ilike.${prompt}`)
          .order('data->followerCountCached', { ascending: false } as any)
          .limit(limit)
      ),
      run(
        selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
          .not('id', 'in', excludingArrayString)
          .or(`data->>username.ilike.${prompt}%,data->>name.ilike.${prompt}%`)
          .order('data->lastBetTime', {
            ascending: false,
            nullsFirst: false,
          } as any)
          .limit(limit)
      ),
      run(
        selectFrom(db, 'users', 'id', 'name', 'username', 'avatarUrl')
          .not('id', 'in', excludingArrayString)
          .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
          .order('data->lastBetTime', {
            ascending: false,
            nullsFirst: false,
          } as any)
          .limit(limit)
      ),
    ])

  return uniqBy([...exactData, ...prefixData, ...containsData], 'id').slice(
    0,
    limit
  )
}
