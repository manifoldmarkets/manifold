import { db } from './db'
import { run } from 'common/supabase/utils'

export async function searchUsers(prompt: string) {
  const { data } = await run(
    db
      .from('users')
      .select('data, id')
      .or(`data->>username.ilike.%${prompt}%,data->>name.ilike.%${prompt}%`)
  )
  return data
}
