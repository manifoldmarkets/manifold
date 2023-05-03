import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { Group } from 'common/group'
import {
  run,
  selectFrom,
  selectJson,
  SupabaseClient,
} from 'common/supabase/utils'
import { db } from './db'
import { Contract } from '../firebase/contracts'
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

export async function getGroupBySlug(groupSlug: string) {
  const { data } = await run(
    db.from('groups').select('data').eq('slug', groupSlug).limit(1)
  )
  return data ? (data[0]?.data as Group) : null
}

export async function getGroup(groupId: string) {
  const { data } = await run(
    db.from('groups').select('data').eq('id', groupId).limit(1)
  )
  return data ? (data[0]?.data as Group) : null
}

export async function getGroupContracts(groupId: string) {
  const { data } = await run(
    db.rpc('get_group_contracts', {
      this_group_id: groupId,
    })
  )
  if (data && data.length > 0) {
    return data.map((contract) => (contract as any).data as Contract)
  }
  return []
}

export async function getGroupContractIds(groupId: string) {
  const { data } = await run(
    db.from('group_contracts').select('contract_id').eq('group_id', groupId)
  )
  if (data && data.length > 0) {
    return data.map((group) => group.contract_id as string)
  }
  return []
}

export async function listGroupsBySlug(groupSlugs: string[]) {
  const { data } = await run(
    db.from('groups').select('data').in('slug', groupSlugs)
  )
  if (data && data.length > 0) {
    return data.map((group) => group.data as Group)
  }
  return []
}

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
  if (prompt) query.ilike('name', `%${prompt}%`)

  return (await run(query)).data
}

export async function getMemberGroups(userId: string, db: SupabaseClient) {
  const groupIds = await getMemberGroupIds(userId, db)
  const query = selectJson(db, 'groups').in('id', groupIds)

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
      .in('id', groupIds)
      .in('slug', DESTINY_GROUP_SLUGS)
  )

  return data.length === 0
}

export async function getMemberGroupIds(userId: string, db: SupabaseClient) {
  const { data: groupIds } = await run(
    db.from('group_members').select('group_id').eq('member_id', userId)
  )

  return groupIds ? groupIds.map((groupId) => groupId.group_id) : []
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
