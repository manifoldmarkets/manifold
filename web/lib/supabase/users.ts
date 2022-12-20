import { db } from './db'
import { run } from 'common/supabase/utils'

export async function searchUsers(prompt: string) {
  const { data } = await run(
    db
      .from('users')
      .select(
        'data->username, data->name, data->id, data->avatarUrl, data->followerCountCached'
      )
      .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
    // TODO: use fts (fullTextsearch) instead of ilike
  )

  return data
}
