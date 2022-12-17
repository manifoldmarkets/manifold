import { db } from './db'

export async function searchUsers(prompt: string) {
  const { data } = await db
    .from('users')
    .select(
      'data->username, data->name, data->id, data->avatarUrl, data->followerCountCached'
    )
    .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
  return data
}
