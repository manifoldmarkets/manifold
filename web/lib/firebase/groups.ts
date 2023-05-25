import { Contract } from 'common/contract'
import { Group, GroupContractDoc } from 'common/group'
import { filterDefined } from 'common/util/array'
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  updateDoc,
  where,
} from 'firebase/firestore'
import { partition } from 'lodash'
import { db } from 'web/lib/firebase/init'
import { coll, getValue, getValues, listenForValues } from './utils'
import { getContract } from '../supabase/contracts'

export const groups = coll<Group>('groups')
export const groupMembers = (groupId: string) =>
  collection(groups, groupId, 'groupMembers')
export const groupContracts = (groupId: string) =>
  collection(groups, groupId, 'groupContracts')

export const memberGroupsQuery = (userId: string) =>
  query(collectionGroup(db, 'groupMembers'), where('userId', '==', userId))

export function updateGroup(group: Group, updates: Partial<Group>) {
  return updateDoc(doc(groups, group.id), updates)
}

export function deleteFieldFromGroup(group: Group, field: string) {
  return updateDoc(doc(groups, group.id), { [field]: deleteField() })
}

export async function listGroups(groupSlugs: string[]) {
  return Promise.all(groupSlugs.map(getGroupBySlug))
}

export async function getGroupContractIds(groupId: string) {
  const docs = await getValues<GroupContractDoc>(groupContracts(groupId))
  return docs.map((d) => d.contractId)
}

export function listenForGroupContractDocs(
  groupId: string,
  setContractDocs: (docs: GroupContractDoc[]) => void
) {
  return listenForValues(groupContracts(groupId), setContractDocs)
}

export async function listGroupContracts(groupId: string) {
  const contractDocs = await getValues<{
    contractId: string
    createdTime: number
  }>(groupContracts(groupId))
  const contracts = await Promise.all(
    contractDocs.map((doc) => getContract(doc.contractId))
  )
  return filterDefined(contracts)
}

export function getGroup(groupId: string) {
  return getValue<Group>(doc(groups, groupId))
}

export async function getGroupBySlug(slug: string) {
  const q = query(groups, where('slug', '==', slug))
  const docs = (await getDocs(q)).docs
  return docs.length === 0 ? null : docs[0].data()
}

export function listenForMemberGroupIds(
  userId: string,
  setGroupIds: (groupIds: string[]) => void
) {
  const q = memberGroupsQuery(userId)
  return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) return

    const values = snapshot.docs.map((doc) => doc.ref.parent.parent?.id)

    setGroupIds(filterDefined(values))
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
