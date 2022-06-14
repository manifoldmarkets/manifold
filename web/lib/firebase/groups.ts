import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { sortBy } from 'lodash'
import { Group } from 'common/group'
import { Contract, contractCollection } from './contracts'
import { db } from './init'
import { User } from './users'
import { getValue, getValues, listenForValue, listenForValues } from './utils'

const groupCollection = collection(db, 'groups')

export function groupPath(
  group: Group,
  subpath?: 'edit' | 'markets' | 'leaderboards'
) {
  return `/group/${group.slug}${subpath ? `/${subpath}` : ''}`
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

function contractsByTagsQuery(tags: string[]) {
  // TODO: if tags.length > 10, execute multiple parallel queries
  const lowercaseTags = tags.map((tag) => tag.toLowerCase()).slice(0, 10)

  return query(
    contractCollection,
    where('lowercaseTags', 'array-contains-any', lowercaseTags)
  )
}

export async function getGroupContracts(group: Group) {
  const {
    tags,
    contractIds,
    excludedContractIds,
    creatorIds,
    excludedCreatorIds,
  } = group

  const [tagsContracts, includedContracts] = await Promise.all([
    tags.length > 0 ? getValues<Contract>(contractsByTagsQuery(tags)) : [],

    // TODO: if contractIds.length > 10, execute multiple parallel queries
    contractIds.length > 0
      ? getValues<Contract>(
          query(contractCollection, where('id', 'in', contractIds))
        )
      : [],
  ])

  const excludedContractsSet = new Set(excludedContractIds)

  const creatorSet = creatorIds ? new Set(creatorIds) : undefined
  const excludedCreatorSet = excludedCreatorIds
    ? new Set(excludedCreatorIds)
    : undefined

  const approvedContracts = tagsContracts.filter((contract) => {
    const { id, creatorId } = contract

    if (excludedContractsSet.has(id)) return false
    if (creatorSet && !creatorSet.has(creatorId)) return false
    if (excludedCreatorSet && excludedCreatorSet.has(creatorId)) return false

    return true
  })

  return [...approvedContracts, ...includedContracts]
}

export function listenForTaggedContracts(
  tags: string[],
  setContracts: (contracts: Contract[]) => void
) {
  return listenForValues<Contract>(contractsByTagsQuery(tags), setContracts)
}

export function listenForGroup(
  groupId: string,
  setGroup: (group: Group | null) => void
) {
  return listenForValue(doc(groupCollection, groupId), setGroup)
}

export function followGroup(groupId: string, userId: string) {
  const followDoc = doc(groupCollection, groupId, 'followers', userId)
  return setDoc(followDoc, { userId })
}

export function unfollowGroup(group: Group, user: User) {
  const followDoc = doc(groupCollection, group.id, 'followers', user.id)
  return deleteDoc(followDoc)
}

export async function followGroupFromSlug(slug: string, userId: string) {
  const snap = await getDocs(query(groupCollection, where('slug', '==', slug)))
  if (snap.empty) return undefined

  const groupDoc = snap.docs[0]
  const followDoc = doc(groupDoc.ref, 'followers', userId)

  return setDoc(followDoc, { userId })
}

export async function unfollowGroupFromSlug(slug: string, userId: string) {
  const snap = await getDocs(query(groupCollection, where('slug', '==', slug)))
  if (snap.empty) return undefined

  const groupDoc = snap.docs[0]
  const followDoc = doc(groupDoc.ref, 'followers', userId)

  return deleteDoc(followDoc)
}

export function listenForFollow(
  groupId: string,
  userId: string,
  setFollow: (following: boolean) => void
) {
  const followDoc = doc(groupCollection, groupId, 'followers', userId)
  return listenForValue(followDoc, (value) => {
    setFollow(!!value)
  })
}

export async function getGroupsByTags(tags: string[]) {
  if (tags.length === 0) return []

  // TODO: split into multiple queries if tags.length > 10.
  const lowercaseTags = tags.map((tag) => tag.toLowerCase()).slice(0, 10)

  const groups = await getValues<Group>(
    query(
      groupCollection,
      where('lowercaseTags', 'array-contains-any', lowercaseTags)
    )
  )

  return sortBy(groups, (group) => -1 * group.followCount)
}

export function listenForGroupsWithTags(
  tags: string[],
  setGroups: (groups: Group[]) => void
) {
  // TODO: split into multiple queries if tags.length > 10.
  const lowercaseTags = tags.map((tag) => tag.toLowerCase()).slice(0, 10)

  const q = query(
    groupCollection,
    where('lowercaseTags', 'array-contains-any', lowercaseTags)
  )

  return listenForValues<Group>(q, (groups) => {
    const sorted = sortBy(groups, (group) => -1 * group.followCount)
    setGroups(sorted)
  })
}

export async function getFollowedGroups(userId: string) {
  const snapshot = await getDocs(
    query(collectionGroup(db, 'followers'), where('userId', '==', userId))
  )
  const groupIds = snapshot.docs.map(
    (doc) => doc.ref.parent.parent?.id as string
  )
  return groupIds
}

export function listenForFollowedGroups(
  userId: string,
  setGroupIds: (groupIds: string[]) => void
) {
  return onSnapshot(
    query(collectionGroup(db, 'followers'), where('userId', '==', userId)),
    (snapshot) => {
      if (snapshot.metadata.fromCache) return

      const groupIds = snapshot.docs.map(
        (doc) => doc.ref.parent.parent?.id as string
      )
      setGroupIds(groupIds)
    }
  )
}
