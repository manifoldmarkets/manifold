import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const getLover = async (userId: string) => {
  const res = await run(db.from('lovers').select('*').eq('user_id', userId))
  return res.data[0]
}
