import { db } from './db'
import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { uniqBy } from 'lodash'

export type SearchUserInfo = Pick<
  User,
  'id' | 'name' | 'username' | 'avatarUrl'
>

export async function searchUsers(prompt: string, limit: number) {
  const { data } =
    prompt != ''
      ? await run(
          db
            .from('users')
            .select('id, data->name, data->username, data->avatarUrl')
            .eq('data->>username', prompt)
            .limit(limit)
        )
      : await run(
          db
            .from('users')
            .select('id, data->name, data->username, data->avatarUrl')
            .order('data->followerCountCached', { ascending: false } as any)
            .limit(limit)
        )
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
  return uniqBy([...data, ...similarData], 'id').slice(0, limit)
}
