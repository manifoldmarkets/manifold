import { db } from './db'
import { run } from 'common/supabase/utils'

export async function searchUsers(prompt: string, limit: number) {
  const { data } = await run(
    db
      .from('users')
      .select('data->username, data->name, data->id, data->avatarUrl')
      // TODO: use fts (fullTextsearch) instead of ilike
      .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
      .order('data->followerCountCached', { ascending: false } as any)
      .limit(limit)
  )

  return data
}
