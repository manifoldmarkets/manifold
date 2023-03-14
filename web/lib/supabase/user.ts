import { run } from 'common/supabase/utils'
import { User } from 'common/user'
import { db } from './db'

export async function getUser(userId: string) {
  const { data: user } = await run(
    db.from('users').select('data').eq('id', userId)
  )
  if (user && user.length > 0) {
    return user[0].data as User
  } else {
    return null
  }
}
