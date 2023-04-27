import { SupabaseClient } from '@supabase/supabase-js'
import { run } from './utils'

export async function getUserIsMember(
  groupId: string | undefined | null,
  userId: string | undefined | null,
  db: SupabaseClient
) {
  if (!userId || !groupId) return false

  const { data } = await run(
    db
      .from('group_members')
      .select('group_id, member_id')
      .eq('group_id', groupId)
      .eq('member_id', userId)
      .limit(1)
  )
  return data && data.length > 0
}
