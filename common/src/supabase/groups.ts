import { SupabaseClient } from '@supabase/supabase-js'
import { Row, mapTypes, run } from 'common/supabase/utils'
import { Group } from 'common/group'

export const NON_PREDICTIVE_GROUP_ID = 'f141b8ca-eac3-4400-962a-72973b3ceb62'
export const NON_PREDICTIVE_TOPIC_NAME = 'Non-Predictive'

export async function getGroup(db: SupabaseClient, groupId: string) {
  const { data } = await run(db.from('groups').select().eq('id', groupId))
  if (data && data.length > 0) {
    return convertGroup(data[0])
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

export async function getGroupMemberIds(db: SupabaseClient, groupId: string) {
  const { data } = await run(
    db.from('group_members').select('member_id').eq('group_id', groupId)
  )
  return data ? data.map((member) => member.member_id) : []
}

export const convertGroup = (
  sqlGroup: Partial<Row<'groups'>> & { id: string }
) =>
  mapTypes<'groups', Group>(sqlGroup, {
    fs_updated_time: false,
    name_fts: false,
  })
