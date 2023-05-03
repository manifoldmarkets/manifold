import { Contract } from 'common/contract'
import { Group } from 'common/group'
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { partition } from 'lodash'
import { db } from 'web/lib/firebase/init'
import { getGroup } from '../supabase/group'
import { coll } from './utils'

export const groups = coll<Group>('groups')
export const groupMembers = (groupId: string) =>
  collection(groups, groupId, 'groupMembers')
export const groupContracts = (groupId: string) =>
  collection(groups, groupId, 'groupContracts')
const openGroupsQuery = query(groups, where('anyoneCanJoin', '==', true))
export const memberGroupsQuery = (userId: string) =>
  query(collectionGroup(db, 'groupMembers'), where('userId', '==', userId))

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

export function getGroupLinkToDisplay(contract: Contract) {
  const { groupLinks } = contract
  const sortedGroupLinks = groupLinks?.sort(
    (a, b) => b.createdTime - a.createdTime
  )
  const groupCreatorAdded = sortedGroupLinks?.find(
    (g) => g.userId === contract.creatorId
  )
  const groupToDisplay = groupCreatorAdded
    ? groupCreatorAdded
    : sortedGroupLinks?.[0] ?? null
  return groupToDisplay
}

export function getGroupLinksToDisplay(contract: Contract) {
  const { groupLinks } = contract
  const sortedGroupLinks =
    groupLinks?.sort((a, b) => b.createdTime - a.createdTime) ?? []

  const [groupsCreatorAdded, otherGroups] = partition(
    sortedGroupLinks,
    (g) => g.userId === contract.creatorId
  )
  return [...groupsCreatorAdded, ...otherGroups].slice(0, 3)
}

export const topFollowedGroupsQuery = query(
  groups,
  where('anyoneCanJoin', '==', true),
  orderBy('totalMembers', 'desc')
)
