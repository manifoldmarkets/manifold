import { SupabaseClient } from '@supabase/supabase-js'
import { run } from './utils'
import { Group } from 'common/group'

export async function getGroup(db: SupabaseClient, groupId: string) {
  const { data } = await run(db.from('groups').select('data').eq('id', groupId))
  if (data && data.length > 0) {
    return data[0].data as Group
  } else {
    return null
  }
}

export async function getUserIsMember(
  db: SupabaseClient,
  groupId: string | undefined | null,
  userId: string | undefined | null
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
