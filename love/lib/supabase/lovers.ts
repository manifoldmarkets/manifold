import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const deleteLover = async (userId: string) => {
  await run(db.from('lovers').delete().filter('user_id', 'eq', userId))
}
