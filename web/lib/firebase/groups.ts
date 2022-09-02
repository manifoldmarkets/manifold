import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { uniq } from 'lodash'
import { Group, GROUP_CHAT_SLUG, GroupLink } from 'common/group'
import {
  coll,
  getValue,
  getValues,
  listenForValue,
  listenForValues,
} from './utils'
import { Contract } from 'common/contract'
import { updateContract } from 'web/lib/firebase/contracts'
import { db } from 'web/lib/firebase/init'
import { filterDefined } from 'common/lib/util/array'

export const groups = coll<Group>('groups')
export const groupMembers = (groupId: string) =>
  collection(groups, groupId, 'groupMembers')
export const groupContracts = (groupId: string) =>
  collection(groups, groupId, 'groupContracts')

export function groupPath(
  groupSlug: string,
  subpath?:
    | 'edit'
    | 'markets'
    | 'about'
    | typeof GROUP_CHAT_SLUG
    | 'leaderboards'
) {
  return `/group/${groupSlug}${subpath ? `/${subpath}` : ''}`
}

export type GroupContractDoc = { contractId: string; createdTime: number }
export type GroupMemberDoc = { userId: string; createdTime: number }

export function updateGroup(group: Group, updates: Partial<Group>) {
  return updateDoc(doc(groups, group.id), updates)
}

export function deleteFieldFromGroup(group: Group, field: string) {
  return updateDoc(doc(groups, group.id), { [field]: deleteField() })
}

export function deleteGroup(group: Group) {
  return deleteDoc(doc(groups, group.id))
}

export async function listAllGroups() {
  return getValues<Group>(groups)
}

export async function listGroups(groupSlugs: string[]) {
  return Promise.all(groupSlugs.map(getGroupBySlug))
}

export function listenForGroups(setGroups: (groups: Group[]) => void) {
  return listenForValues(groups, setGroups)
}

export function listenForGroupContractDocs(
  groupId: string,
  setContractDocs: (docs: GroupContractDoc[]) => void
) {
  return listenForValues(groupContracts(groupId), setContractDocs)
}

export function listenForOpenGroups(setGroups: (groups: Group[]) => void) {
  return listenForValues(
    query(groups, where('anyoneCanJoin', '==', true)),
    setGroups
  )
}

export function getGroup(groupId: string) {
  return getValue<Group>(doc(groups, groupId))
}

export function getGroupContracts(groupId: string) {
  return getValues<{ contractId: string; createdTime: number }>(
    groupContracts(groupId)
  )
}

export async function getGroupBySlug(slug: string) {
  const q = query(groups, where('slug', '==', slug))
  const docs = (await getDocs(q)).docs
  return docs.length === 0 ? null : docs[0].data()
}

export function listenForGroup(
  groupId: string,
  setGroup: (group: Group | null) => void
) {
  return listenForValue(doc(groups, groupId), setGroup)
}

export function listenForMemberGroupIds(
  userId: string,
  setGroupIds: (groupIds: string[]) => void
) {
  const q = query(
    collectionGroup(db, 'groupMembers'),
    where('userId', '==', userId)
  )
  return onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache) return

    const values = snapshot.docs.map((doc) => doc.ref.parent.parent?.id)

    setGroupIds(filterDefined(values))
  })
}

export function listenForMemberGroups(
  userId: string,
  setGroups: (groups: Group[]) => void
) {
  return listenForMemberGroupIds(userId, (groupIds) => {
    return Promise.all(groupIds.map(getGroup)).then((groups) => {
      setGroups(filterDefined(groups))
    })
  })
}

export async function addUserToGroupViaId(groupId: string, userId: string) {
  // get group to get the member ids
  const group = await getGroup(groupId)
  if (!group) {
    console.error(`Group not found: ${groupId}`)
    return
  }
  return await joinGroup(group, userId)
}

export async function joinGroup(group: Group, userId: string): Promise<void> {
  // create a new member document in grouoMembers collection
  const memberDoc = doc(groupMembers(group.id), userId)
  return await setDoc(memberDoc, {
    userId,
    createdTime: Date.now(),
  })
}

export async function leaveGroup(group: Group, userId: string): Promise<void> {
  // delete the member document in groupMembers collection
  const memberDoc = doc(groupMembers(group.id), userId)
  return await deleteDoc(memberDoc)
}

export async function addContractToGroup(
  group: Group,
  contract: Contract,
  userId: string
) {
  if (!canModifyGroupContracts(group, userId)) return
  const newGroupLinks = [
    ...(contract.groupLinks ?? []),
    {
      groupId: group.id,
      createdTime: Date.now(),
      slug: group.slug,
      userId,
      name: group.name,
    } as GroupLink,
  ]
  // It's good to update the contract first, so the on-update-group trigger doesn't re-add them
  await updateContract(contract.id, {
    groupSlugs: uniq([...(contract.groupSlugs ?? []), group.slug]),
    groupLinks: newGroupLinks,
  })

  // create new contract document in groupContracts collection
  const contractDoc = doc(groupContracts(group.id), contract.id)
  await setDoc(contractDoc, {
    contractId: contract.id,
    createdTime: Date.now(),
  })
}

export async function removeContractFromGroup(
  group: Group,
  contract: Contract,
  userId: string
) {
  if (!canModifyGroupContracts(group, userId)) return

  if (contract.groupLinks?.map((l) => l.groupId).includes(group.id)) {
    const newGroupLinks = contract.groupLinks?.filter(
      (link) => link.slug !== group.slug
    )
    await updateContract(contract.id, {
      groupSlugs:
        contract.groupSlugs?.filter((slug) => slug !== group.slug) ?? [],
      groupLinks: newGroupLinks ?? [],
    })
  }

  // delete the contract document in groupContracts collection
  const contractDoc = doc(groupContracts(group.id), contract.id)
  await deleteDoc(contractDoc)
}

export function canModifyGroupContracts(group: Group, userId: string) {
  return (
    group.creatorId === userId ||
    // TODO: check if member document exists
    // group.memberIds.includes(userId) ||
    group.anyoneCanJoin
  )
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
