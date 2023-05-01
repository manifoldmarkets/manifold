import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'
import { uniqBy } from 'lodash'
import { User } from 'common/user'

export type UserSearchResult = Awaited<ReturnType<typeof searchUsers>>[number]

export async function searchUsers(
  prompt: string,
  limit: number,
  extraFields?: (keyof User)[]
) {
  const defaultFields: (keyof User)[] = ['id', 'name', 'username', 'avatarUrl']
  const fields = [...defaultFields, ...(extraFields ?? [])]
  if (prompt === '') {
    const { data } = await run(
      selectFrom(db, 'users', ...fields)
        .order('data->followerCountCached', { ascending: false } as any)
        .limit(limit)
    )
    return data
  }

  const { data } = await db.rpc('search_users', { query: prompt, count: limit })

  return data?.map((d: any) => d.data as User) ?? []
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
          .order('follower_count', { ascending: false })
          .limit(limit)
      ),
      run(
        db
          .from('user_groups')
          .select('*')
          .not('groups', 'cs', `{${groupId}}`)
          .or(`username.ilike.${prompt}%,name.ilike.${prompt}%`)
          .order('follower_count', { ascending: false })
          .limit(limit)
      ),
      run(
        db
          .from('user_groups')
          .select('*')
          .not('groups', 'cs', `{${groupId}}`)
          .or(`username.ilike.%${prompt}%,name.ilike.%${prompt}%`)
          .order('follower_count', { ascending: false })
          .limit(limit)
      ),
    ])

  return uniqBy([...exactData, ...prefixData, ...containsData], 'id').slice(
    0,
    limit
  )
}
