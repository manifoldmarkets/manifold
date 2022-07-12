import {
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { sortBy, uniq } from 'lodash'
import { Group } from 'common/group'
import { contracts, getContractFromId, updateContract } from './contracts'
import {
  coll,
  getValue,
  getValues,
  listenForValue,
  listenForValues,
} from './utils'
import { filterDefined } from 'common/util/array'
import { Contract } from 'common/contract'

export const groups = coll<Group>('groups')

export function groupPath(
  groupSlug: string,
  subpath?: 'edit' | 'questions' | 'about' | 'chat' | 'rankings'
) {
  return `/group/${groupSlug}${subpath ? `/${subpath}` : ''}`
}

export function updateGroup(group: Group, updates: Partial<Group>) {
  return updateDoc(doc(groups, group.id), updates)
}

export function deleteGroup(group: Group) {
  return deleteDoc(doc(groups, group.id))
}

export async function listAllGroups() {
  return getValues<Group>(groups)
}

export function listenForGroups(setGroups: (groups: Group[]) => void) {
  return listenForValues(groups, setGroups)
}

export function getGroup(groupId: string) {
  return getValue<Group>(doc(groups, groupId))
}

export async function getGroupBySlug(slug: string) {
  const q = query(groups, where('slug', '==', slug))
  const docs = (await getDocs(q)).docs
  return docs.length === 0 ? null : docs[0].data()
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
  return listenForValue(doc(groups, groupId), setGroup)
}

export function listenForMemberGroups(
  userId: string,
  setGroups: (groups: Group[]) => void
) {
  const q = query(groups, where('memberIds', 'array-contains', userId))

  return listenForValues<Group>(q, (groups) => {
    const sorted = sortBy(groups, [(group) => -group.mostRecentActivityTime])
    setGroups(sorted)
  })
}

export async function getGroupsWithContractId(
  contractId: string,
  setGroups: (groups: Group[]) => void
) {
  const q = query(groups, where('contractIds', 'array-contains', contractId))
  setGroups(await getValues<Group>(q))
}

export async function addUserToGroupViaSlug(groupSlug: string, userId: string) {
  // get group to get the member ids
  const group = await getGroupBySlug(groupSlug)
  if (!group) {
    console.error(`Group not found: ${groupSlug}`)
    return
  }
  return await addUserToGroup(group, userId)
}

export async function addUserToGroup(
  group: Group,
  userId: string
): Promise<Group> {
  const { memberIds } = group
  if (memberIds.includes(userId)) {
    return group
  }
  const newMemberIds = [...memberIds, userId]
  const newGroup = { ...group, memberIds: newMemberIds }
  await updateGroup(newGroup, { memberIds: uniq(newMemberIds) })
  return newGroup
}
export async function leaveGroup(group: Group, userId: string): Promise<Group> {
  const { memberIds } = group
  if (!memberIds.includes(userId)) {
    return group
  }
  const newMemberIds = memberIds.filter((id) => id !== userId)
  const newGroup = { ...group, memberIds: newMemberIds }
  await updateGroup(newGroup, { memberIds: uniq(newMemberIds) })
  return newGroup
}

export async function addContractToGroup(group: Group, contract: Contract) {
  await updateContract(contract.id, {
    groupSlugs: [...(contract.groupSlugs ?? []), group.slug],
  })
  return await updateGroup(group, {
    contractIds: uniq([...group.contractIds, contract.id]),
  })
    .then(() => group)
    .catch((err) => {
      console.error('error adding contract to group', err)
      return err
    })
}

export async function setContractGroupSlugs(group: Group, contractId: string) {
  await updateContract(contractId, { groupSlugs: [group.slug] })
  return await updateGroup(group, {
    contractIds: uniq([...group.contractIds, contractId]),
  })
    .then(() => group)
    .catch((err) => {
      console.error('error adding contract to group', err)
      return err
    })
}
