import { db } from './db'
import { run } from 'common/supabase/utils'
import { Group } from 'common/group'
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

export async function searchGroups(prompt: string, limit: number) {
  const query = db
    .from('groups')
    .select(
      'id, data->name, data->about, data->slug, data->totalMembers, data->totalContracts, data->anyoneCanJoin'
    )
    .order('data->totalMembers', { ascending: false } as any)
    .limit(limit)
  if (prompt)
    query.or(`data->>name.ilike.%${prompt}%,data->>about.ilike.%${prompt}%`)

  const { data } = await run(query)
  return data as SearchGroupInfo[]
}

export async function getMemberGroups(userId: string) {
  const { data: groupIds } = await run(
    db.from('group_members').select('group_id').eq('member_id', userId)
  )

  const { data: groups } = await run(
    db
      .from('groups')
      .select(
        'id, data->name, data->about, data->slug, data->totalMembers, data->totalContracts, data->anyoneCanJoin'
      )
      .in(
        'id',
        groupIds.map((d: { group_id: string }) => d.group_id)
      )
  )

  return groups as SearchGroupInfo[]
}

export async function getGroupAdmins(groupId: string) {
  const admins = await run(
    db
      .from('group_role')
      .select('*')
      .eq('group_id', groupId)
      .eq('role', 'admin')
      .order('name')
  )
  return admins
}

export const MEMBER_LOAD_NUM = 3

export async function getGroupFollowers(groupId: string, offset: number) {
  const followers = await run(
    db
      .from('group_role')
      .select('*')
      .eq('group_id', groupId)
      .is('role', null)
      .order('name')
      .range(
        offset * MEMBER_LOAD_NUM,
        offset * MEMBER_LOAD_NUM + MEMBER_LOAD_NUM
      )
  )
  return followers
}

export async function getMemberGroupsCount(userId: string) {
  const { data } = await run(
    db.from('group_members').select('count').eq('member_id', userId)
  )
  return data[0].count as number
}
