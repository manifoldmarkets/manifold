import { Group } from 'common/group'
import { run, SupabaseClient } from 'common/supabase/utils'
import { chunk, uniqBy } from 'lodash'
import { groupRoleType as GroupRoleType } from 'web/components/groups/group-member-modal'
import { User } from '../firebase/users'
import { db } from './db'
import { Contract } from 'common/contract'

// functions called for one group
export async function getNumGroupMembers(groupId: string) {
  const { count } = await run(
    db
      .from('group_members')
      .select('*', { head: true, count: 'exact' })
      .eq('group_id', groupId)
  )
  return count as number
}

export async function getGroupOfRole(groupId: string, role: GroupRoleType) {
  const roleMembers = await run(
    db
      .from('group_role')
      .select('*')
      .eq('group_id', groupId)
      .eq('role', role)
      .order('name')
  )
  return roleMembers
}

export const MEMBER_LOAD_NUM = 50

export async function getGroupMembers(
  groupId: string,
  offset: number,
  start?: number
) {
  const followers = await run(
    db
      .from('group_role')
      .select('*')
      .eq('group_id', groupId)
      .is('role', null)
      .order('name')
      .range(
        start ? start : offset * MEMBER_LOAD_NUM,
        offset * MEMBER_LOAD_NUM + MEMBER_LOAD_NUM - 1
      )
  )
  return followers
}

export async function getGroupMemberIds(groupId: string) {
  const groupMemberIds = await run(
    db.from('group_role').select('member_id').eq('group_id', groupId)
  )
  return groupMemberIds.data.map((member) => member.member_id)
}

export async function getMemberRole(user: User, groupId: string) {
  const followers = await run(
    db
      .from('group_role')
      .select('role')
      .eq('group_id', groupId)
      .eq('member_id', user.id)
  )
  return followers
}

export async function getGroupContractIds(groupId: string) {
  const groupContractIds = await run(
    db.from('group_contracts').select('contract_id').eq('group_id', groupId)
  )
  return groupContractIds.data.map((gids) => gids.contract_id)
}

export async function searchUserInGroup(
  groupId: string,
  prompt: string,
  limit: number
) {
  if (prompt === '') {
    const { data } = await run(
      db
        .from('group_role')
        .select('*')
        .eq('group_id', groupId)
        .order('name')
        .limit(limit)
    )
    return data
  }

  const [{ data: exactData }, { data: prefixData }, { data: containsData }] =
    await Promise.all([
      run(
        db
          .from('group_role')
          .select('*')
          .eq('group_id', groupId)
          .or(`username.ilike.${prompt},name.ilike.${prompt}`)
          .limit(limit)
      ),
      run(
        db
          .from('group_role')
          .select('*')
          .eq('group_id', groupId)
          .or(`username.ilike.${prompt}%,name.ilike.${prompt}%`)
          .limit(limit)
      ),
      run(
        db
          .from('group_role')
          .select('*')
          .eq('group_id', groupId)
          .or(`username.ilike.%${prompt}%,name.ilike.%${prompt}%`)
          .limit(limit)
      ),
    ])
  return uniqBy(
    [...exactData, ...prefixData, ...containsData],
    'member_id'
  ).slice(0, limit)
}

export async function getGroupMarkets(groupId: string) {
  const { data: contractIds } = await run(
    db.from('group_contracts').select('contract_id').eq('group_id', groupId)
  )

  if (!contractIds) return null
  const chunkedContractIds = chunk(contractIds, 200)
  const data = await Promise.all(
    chunkedContractIds.map(
      async (chunkedIds) =>
        await run(
          db
            .from('public_contracts')
            .select('data')
            .in(
              'id',
              chunkedIds.map((c) => c.contract_id)
            )
        )
    )
  )
  const markets = data.flatMap((d) => d.data)
  return markets.map((m) => m.data as Contract)
}

export async function getGroupFromSlug(groupSlug: string, db: SupabaseClient) {
  const { data: group } = await run(
    db.from('groups').select('data').eq('slug', groupSlug)
  )

  if (group && group.length > 0) {
    return group[0].data as Group
  }
  return null
}
