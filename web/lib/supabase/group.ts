import { db } from './db'
import { run } from 'common/supabase/utils'
import { User } from '../firebase/users'
import { useAdmin } from 'web/hooks/use-admin'
import { useState } from 'react'

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

export async function getGroupModerators(groupId: string) {
  const moderators = await run(
    db
      .from('group_role')
      .select('*')
      .eq('group_id', groupId)
      .eq('role', 'moderator')
      .order('name')
  )
  return moderators
}

export const MEMBER_LOAD_NUM = 50

export async function getGroupMembers(groupId: string, offset: number) {
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
