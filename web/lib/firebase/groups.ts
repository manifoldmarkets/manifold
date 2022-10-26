import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { partition, uniq, uniqBy } from 'lodash'
import { Group, GROUP_CHAT_SLUG, GroupLink } from 'common/group'
import {
  coll,
  getValue,
  getValues,
  listenForValue,
  listenForValues,
} from './utils'
import { Contract } from 'common/contract'
import { getContractFromId, updateContract } from 'web/lib/firebase/contracts'
import { db } from 'web/lib/firebase/init'
import { filterDefined } from 'common/util/array'

export const groups = coll<Group>('groups')
export const groupMembers = (groupId: string) =>
  collection(groups, groupId, 'groupMembers')
export const groupContracts = (groupId: string) =>
  collection(groups, groupId, 'groupContracts')
const openGroupsQuery = query(groups, where('anyoneCanJoin', '==', true))
export const memberGroupsQuery = (userId: string) =>
  query(collectionGroup(db, 'groupMembers'), where('userId', '==', userId))

export function groupPath(
  groupSlug: string,
  subpath?:
    | 'edit'
    | 'markets'
    | 'about'
    | typeof GROUP_CHAT_SLUG
    | 'leaderboards'
    | 'posts'
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

export async function listGroupContracts(groupId: string) {
  const contractDocs = await getValues<{
    contractId: string
    createdTime: number
  }>(groupContracts(groupId))
  const contracts = await Promise.all(
    contractDocs.map((doc) => getContractFromId(doc.contractId))
  )
  return filterDefined(contracts)
}

export function listenForOpenGroups(setGroups: (groups: Group[]) => void) {
  return listenForValues(openGroupsQuery, setGroups)
}

export function getGroup(groupId: string) {
  return getValue<Group>(doc(groups, groupId))
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

export async function getMemberGroups(userId: string) {
  const snapshot = await getDocs(memberGroupsQuery(userId))
  const groupIds = filterDefined(
    snapshot.docs.map((doc) => doc.ref.parent.parent?.id)
  )
  const groups = await Promise.all(groupIds.map(getGroup))
  return filterDefined(groups)
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

export async function listAvailableGroups(userId: string) {
  const [openGroups, memberGroupSnapshot] = await Promise.all([
    getValues<Group>(openGroupsQuery),
    getDocs(memberGroupsQuery(userId)),
  ])
  const memberGroups = filterDefined(
    await Promise.all(
      memberGroupSnapshot.docs.map((doc) => {
        return doc.ref.parent.parent?.id
          ? getGroup(doc.ref.parent.parent?.id)
          : null
      })
    )
  )

  return uniqBy([...openGroups, ...memberGroups], (g) => g.id)
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

// TODO: This doesn't check if the user has permission to do this
export async function addContractToGroup(
  group: Group,
  contract: Contract,
  userId: string
) {
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
}

// TODO: This doesn't check if the user has permission to do this
export async function removeContractFromGroup(
  group: Group,
  contract: Contract
) {
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

export async function listMemberIds(group: Group) {
  const members = await getValues<GroupMemberDoc>(groupMembers(group.id))
  return members.map((m) => m.userId)
}

export const topFollowedGroupsQuery = query(
  groups,
  where('anyoneCanJoin', '==', true),
  orderBy('totalMembers', 'desc')
)
