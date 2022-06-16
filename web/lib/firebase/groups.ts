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
import { getUser, User } from './users'
import { getValue, getValues, listenForValue, listenForValues } from './utils'
import { useEffect, useState } from 'react'

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

export function useMembers(group: Group) {
  const [members, setMembers] = useState<User[]>([])
  useEffect(() => {
    const { memberIds, creatorId } = group
    if (memberIds.length > 1)
      // get users via their user ids:
      Promise.all(
        memberIds.filter((mId) => mId !== creatorId).map(getUser)
      ).then((users) => {
        const members = users.filter((user) => user)
        setMembers(members)
      })
  }, [group])
  return members
}
