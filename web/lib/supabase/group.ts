import { db } from './db'
import { run } from 'common/supabase/utils'

export async function getNumGroupMembers(groupId: string) {
  const { data } = await run(
    db.from('group_role').select('count').eq('group_id', groupId)
  )
  return data[0].count as number
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

export async function getGroupContributors(groupId: string) {
  const contributors = await run(
    db
      .from('group_role')
      .select('*')
      .eq('group_id', groupId)
      .eq('role', 'contributor')
      .order('name')
  )
  return contributors
}

export const MEMBER_LOAD_NUM = 50

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
        offset * MEMBER_LOAD_NUM + MEMBER_LOAD_NUM - 1
      )
  )
  return followers
}
