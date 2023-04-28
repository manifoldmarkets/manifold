import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { Group } from 'common/group'
import {
  run,
  selectFrom,
  selectJson,
  SupabaseClient,
} from 'common/supabase/utils'
import { db } from './db'
export type SearchGroupInfo = Pick<
  Group,
  | 'id'
  | 'name'
  | 'slug'
  | 'about'
  | 'totalContracts'
  | 'totalMembers'
  | 'privacyStatus'
>

// functions called for multiple groups
export async function searchGroups(prompt: string, limit: number) {
  const query = selectFrom(
    db,
    'groups',
    'id',
    'name',
    'about',
    'slug',
    'totalMembers',
    'totalContracts',
    'privacyStatus'
  )
    .order('data->totalMembers', { ascending: false } as any)
    .limit(limit)
  if (prompt) query.or(`name.ilike.%${prompt}%,data->>about.ilike.%${prompt}%`)

  return (await run(query)).data
}

export async function getMemberGroups(userId: string, db: SupabaseClient) {
  const groupIds = await getMemberGroupIds(userId, db)
  const query = selectJson(db, 'groups').in(
    'id',
    groupIds.map((d: { group_id: string }) => d.group_id)
  )

  return (await run(query)).data.map((d) => d.data as Group)
}

export async function getShouldBlockDestiny(
  userId: string,
  db: SupabaseClient
) {
  const groupIds = await getMemberGroupIds(userId, db)
  const { data } = await run(
    db
      .from('groups')
      .select('data')
      .in(
        'id',
        groupIds.map((d: { group_id: string }) => d.group_id)
      )
      .in('slug', DESTINY_GROUP_SLUGS)
  )

  return data.length === 0
}

export async function getMemberGroupIds(userId: string, db: SupabaseClient) {
  const { data: groupIds } = await run(
    db.from('group_members').select('group_id').eq('member_id', userId)
  )

  return groupIds
}

export async function getMemberGroupsCount(userId: string) {
  const { count } = await run(
    db
      .from('group_members')
      .select('*', { head: true, count: 'exact' })
      .eq('member_id', userId)
  )
  return count
}

// gets all groups where the user is an admin or moderator
export async function getGroupsWhereUserHasRole(userId: string) {
  const groupThings = await run(
    db
      .from('group_role')
      .select('group_data')
      .eq('member_id', userId)
      .or('role.eq.admin,role.eq.moderator')
      .order('name')
  )

  return groupThings.data
}

// gets all groups where the user is member
export async function getGroupsWhereUserIsMember(userId: string) {
  const groupThings = await run(
    db
      .from('group_role')
      .select('group_data')
      .eq('member_id', userId)
      .order('name')
  )

  return groupThings.data
}

// gets all public groups
export async function getPublicGroups() {
  const groupThings = await run(
    db
      .from('groups')
      .select('data')
      .eq('privacy_status', 'public')
      .order('name')
  )

  return groupThings.data.map((d: { data: any }) => d.data as Group)
}
