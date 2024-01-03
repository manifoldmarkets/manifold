import { uniqBy } from 'lodash'
import { type APIHandler } from './helpers/endpoint'
import { type SupabaseClient, run } from 'common/supabase/utils'
import { convertGroup } from 'common/supabase/groups'
import { createSupabaseClient } from 'shared/supabase/init'

export const getGroups: APIHandler<'groups'> = async (props) => {
  const { availableToUserId, beforeTime } = props

  const db = createSupabaseClient()
  const publicGroups = await getPublicGroups(db, 500, beforeTime)

  if (availableToUserId) {
    // TODO: This doesn't work for private groups yet
    const memberGroups = await getMemberGroups(db, availableToUserId)
    return uniqBy(memberGroups.concat(publicGroups), 'id')
  } else {
    return publicGroups
  }
}

async function getPublicGroups(
  db: SupabaseClient,
  limit?: number,
  beforeTime?: number
) {
  let q = db
    .from('groups')
    .select()
    .eq('privacy_status', 'public')
    .order('data->createdTime', { ascending: false } as any)
  if (limit) {
    q = q.limit(limit)
  }
  if (beforeTime) {
    q = q.lt('data->createdTime', beforeTime)
  }
  const { data } = await run(q)

  return data.map(convertGroup)
}

async function getMemberGroups(db: SupabaseClient, userId: string) {
  const { data: groupIds } = await run(
    db.from('group_members').select('group_id').eq('member_id', userId)
  )

  const { data } = await run(db.from('groups').select().in('id', groupIds))

  return data.map(convertGroup)
}
