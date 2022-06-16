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
import { Contract, contractCollection } from './contracts'
import { db } from './init'
import { getValue, getValues, listenForValue, listenForValues } from './utils'

const groupCollection = collection(db, 'groups')

export function groupPath(
  groupSlug: string,
  subpath?: 'edit' | 'questions' | 'details' | 'discussion'
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

  const [includedContracts] = await Promise.all([
    // TODO: if contractIds.length > 10, execute multiple parallel queries
    contractIds.length > 0
      ? getValues<Contract>(
          query(contractCollection, where('id', 'in', contractIds))
        )
      : [],
  ])

  return [...includedContracts]
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
