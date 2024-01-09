import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export async function getLikedContractsCount(userId: string) {
  const { count } = await run(
    db
      .from('user_reactions')
      .select('*', { head: true, count: 'exact' })
      .eq('user_id', userId)
      .eq('data->>type', 'like')
      .contains('data', { contentType: 'contract' })
  )
  return count
}
