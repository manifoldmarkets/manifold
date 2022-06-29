import {
  collection,
  deleteDoc,
  doc,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { sortBy } from 'lodash'
import { Group } from 'common/group'
import { getContractFromId } from './contracts'
import { db } from './init'
import { getValue, getValues, listenForValue, listenForValues } from './utils'
import { filterDefined } from 'common/util/array'

const groupCollection = collection(db, 'groups')

export function groupPath(
  groupSlug: string,
  subpath?: 'edit' | 'questions' | 'about' | 'chat'
) {
  return `/group/${groupSlug}${subpath ? `/${subpath}` : ''}`
}

export function updateGroup(group: Group, updates: Partial<Group>) {
  return updateDoc(doc(groupCollection, group.id), updates)
}

export function deleteGroup(group: Group) {
  return deleteDoc(doc(groupCollection, group.id))
}

export async function listAllGroups() {
  return getValues<Group>(groupCollection)
}

export function listenForGroups(setGroups: (groups: Group[]) => void) {
  return listenForValues(groupCollection, setGroups)
}

export function getGroup(groupId: string) {
  return getValue<Group>(doc(groupCollection, groupId))
}

export async function getGroupBySlug(slug: string) {
  const q = query(groupCollection, where('slug', '==', slug))
  const groups = await getValues<Group>(q)

  return groups.length === 0 ? null : groups[0]
}

export async function getGroupContracts(group: Group) {
  const { contractIds } = group

  const contracts =
    filterDefined(
      await Promise.all(
        contractIds.map(async (contractId) => {
          return await getContractFromId(contractId)
        })
      )
    ) ?? []

  return [...contracts]
}

export function listenForGroup(
  groupId: string,
  setGroup: (group: Group | null) => void
) {
  return listenForValue(doc(groupCollection, groupId), setGroup)
}

export function listenForMemberGroups(
  userId: string,
  setGroups: (groups: Group[]) => void
) {
  const q = query(groupCollection, where('memberIds', 'array-contains', userId))

  return listenForValues<Group>(q, (groups) => {
    const sorted = sortBy(groups, [(group) => -group.mostRecentActivityTime])
    setGroups(sorted)
  })
}

export async function getGroupsWithContractId(
  contractId: string,
  setGroups: (groups: Group[]) => void
) {
  const q = query(
    groupCollection,
    where('contractIds', 'array-contains', contractId)
  )
  const groups = await getValues<Group>(q)
  setGroups(groups)
}

export async function joinGroup(group: Group, userId: string): Promise<Group> {
  const { memberIds } = group
  if (memberIds.includes(userId)) {
    return group
  }
  const newMemberIds = [...memberIds, userId]
  const newGroup = { ...group, memberIds: newMemberIds }
  await updateGroup(newGroup, { memberIds: newMemberIds })
  return newGroup
}
export async function leaveGroup(group: Group, userId: string): Promise<Group> {
  const { memberIds } = group
  if (!memberIds.includes(userId)) {
    return group
  }
  const newMemberIds = memberIds.filter((id) => id !== userId)
  const newGroup = { ...group, memberIds: newMemberIds }
  await updateGroup(newGroup, { memberIds: newMemberIds })
  return newGroup
}
