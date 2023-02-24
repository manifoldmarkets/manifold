import { Group } from 'common/group'
import { run, selectFrom } from 'common/supabase/utils'
import { db } from './db'
export type SearchGroupInfo = Pick<
  Group,
  | 'id'
  | 'name'
  | 'slug'
  | 'about'
  | 'totalContracts'
  | 'totalMembers'
  | 'anyoneCanJoin'
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
    'anyoneCanJoin'
  )
    .order('data->totalMembers', { ascending: false } as any)
    .limit(limit)
  if (prompt)
    query.or(`data->>name.ilike.%${prompt}%,data->>about.ilike.%${prompt}%`)

  return (await run(query)).data
}

export async function getMemberGroups(userId: string) {
  const groupIds = await getMemberGroupIds(userId)
  const query = selectFrom(
    db,
    'groups',
    'id',
    'name',
    'about',
    'slug',
    'totalMembers',
    'totalContracts',
    'anyoneCanJoin'
  ).in(
    'id',
    groupIds.map((d: { group_id: string }) => d.group_id)
  )

  return (await run(query)).data
}

export async function getMemberGroupIds(userId: string) {
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

export async function getNonPublicGroupsWhereUserHasRole(userId: string) {
  const groupThings = await run(
    db
      .from('group_role')
      .select('group_data')
      .eq('member_id', userId)
      .or(
        'group_data->>privacyStatus.eq.private,group_data->>privacyStatus.eq.curated'
      )
      .or('role.eq.admin,role.eq.moderator')
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
      .eq('data->>privacyStatus', 'public')
      .order('data->>name')
  )

  return groupThings.data
}
