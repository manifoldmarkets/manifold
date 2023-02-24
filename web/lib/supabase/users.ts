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

export async function searchUsersNotInGroup(
  prompt: string,
  limit: number,
  groupId: string
) {
  if (prompt === '') {
    const { data } = await run(
      db
        .from('user_groups')
        .select('*')
        .not('groups', 'cs', `{${groupId}}`)
        .order('follower_count', { ascending: false })
        .limit(limit)
    )
    return data
  }

  const [{ data: exactData }, { data: prefixData }, { data: containsData }] =
    await Promise.all([
      run(
        db
          .from('user_groups')
          .select('*')
          .not('groups', 'cs', `{${groupId}}`)
          .or(`username.ilike.${prompt},name.ilike.${prompt}`)
          .order('follower_count')
          .limit(limit)
      ),
      run(
        db
          .from('user_groups')
          .select('*')
          .not('groups', 'cs', `{${groupId}}`)
          .or(`username.ilike.${prompt}%,name.ilike.${prompt}%`)
          .order('follower_count')
          .limit(limit)
      ),
      run(
        db
          .from('user_groups')
          .select('*')
          .not('groups', 'cs', `{${groupId}}`)
          .or(`username.ilike.%${prompt}%,name.ilike.%${prompt}%`)
          .order('follower_count')
          .limit(limit)
      ),
    ])

  return uniqBy([...exactData, ...prefixData, ...containsData], 'id').slice(
    0,
    limit
  )
}
