import { Group } from 'common/group'
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { getGroup } from '../supabase/group'
import { coll } from './utils'

export const groups = coll<Group>('groups')
export const groupMembers = (groupId: string) =>
  collection(groups, groupId, 'groupMembers')

export function updateGroup(group: Group, updates: Partial<Group>) {
  return updateDoc(doc(groups, group.id), updates)
}

export function deleteFieldFromGroup(group: Group, field: string) {
  return updateDoc(doc(groups, group.id), { [field]: deleteField() })
}

export function deleteGroup(group: Group) {
  return deleteDoc(doc(groups, group.id))
}

export async function addUserToGroupViaId(groupId: string, userId: string) {
  // get group to get the member ids
  const group = await getGroup(groupId)
  if (!group) {
    console.error(`Group not found: ${groupId}`)
    return
  }
  return await joinGroup(group.id, userId)
}

export async function joinGroup(
  groupId: string,
  userId: string
): Promise<void> {
  // create a new member document in groupMembers collection
  const memberDoc = doc(groupMembers(groupId), userId)
  return await setDoc(memberDoc, {
    userId,
    createdTime: Date.now(),
  })
}

export async function leaveGroup(
  groupId: string,
  userId: string
): Promise<void> {
  // delete the member document in groupMembers collection
  const memberDoc = doc(groupMembers(groupId), userId)
  return await deleteDoc(memberDoc)
}
