import { db } from './db'
import { run } from 'common/supabase/utils'
import { User } from '../firebase/users'
import { groupRoleType as GroupRoleType } from 'web/components/groups/group-member-modal'

export async function getNumGroupMembers(groupId: string) {
  const { data } = await run(
    db.from('group_role').select('count').eq('group_id', groupId)
  )
  return data[0].count as number
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
