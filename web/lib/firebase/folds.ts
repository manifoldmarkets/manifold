import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import _ from 'lodash'
import { Fold } from '../../../common/fold'
import { Contract, contractCollection } from './contracts'
import { db } from './init'
import { User } from './users'
import { getValue, getValues, listenForValue, listenForValues } from './utils'

const foldCollection = collection(db, 'folds')

export function foldPath(
  fold: Fold,
  subpath?: 'edit' | 'markets' | 'leaderboards'
) {
  return `/fold/${fold.slug}${subpath ? `/${subpath}` : ''}`
}

export function updateFold(fold: Fold, updates: Partial<Fold>) {
  return updateDoc(doc(foldCollection, fold.id), updates)
}

export function deleteFold(fold: Fold) {
  return deleteDoc(doc(foldCollection, fold.id))
}

export async function listAllFolds() {
  return getValues<Fold>(foldCollection)
}

export function listenForFolds(setFolds: (folds: Fold[]) => void) {
  return listenForValues(foldCollection, setFolds)
}

export function getFold(foldId: string) {
  return getValue<Fold>(doc(foldCollection, foldId))
}

export async function getFoldBySlug(slug: string) {
  const q = query(foldCollection, where('slug', '==', slug))
  const folds = await getValues<Fold>(q)

  return folds.length === 0 ? null : folds[0]
}

function contractsByTagsQuery(tags: string[]) {
  return query(
    contractCollection,
    where(
      'lowercaseTags',
      'array-contains-any',
      tags.map((tag) => tag.toLowerCase())
    )
  )
}

export async function getFoldContracts(fold: Fold) {
  const {
    tags,
    contractIds,
    excludedContractIds,
    creatorIds,
    excludedCreatorIds,
  } = fold

  const [tagsContracts, includedContracts] = await Promise.all([
    // TODO: if tags.length > 10, execute multiple parallel queries
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

export function listenForFold(
  foldId: string,
  setFold: (fold: Fold | null) => void
) {
  return listenForValue(doc(foldCollection, foldId), setFold)
}

export function followFold(foldId: string, userId: string) {
  const followDoc = doc(foldCollection, foldId, 'followers', userId)
  return setDoc(followDoc, { userId })
}

export function unfollowFold(fold: Fold, user: User) {
  const followDoc = doc(foldCollection, fold.id, 'followers', user.id)
  return deleteDoc(followDoc)
}

export async function followFoldFromSlug(slug: string, userId: string) {
  const snap = await getDocs(query(foldCollection, where('slug', '==', slug)))
  if (snap.empty) return undefined

  const foldDoc = snap.docs[0]
  const followDoc = doc(foldDoc.ref, 'followers', userId)

  return setDoc(followDoc, { userId })
}

export async function unfollowFoldFromSlug(slug: string, userId: string) {
  const snap = await getDocs(query(foldCollection, where('slug', '==', slug)))
  if (snap.empty) return undefined

  const foldDoc = snap.docs[0]
  const followDoc = doc(foldDoc.ref, 'followers', userId)

  return deleteDoc(followDoc)
}

export function listenForFollow(
  fold: Fold,
  user: User,
  setFollow: (following: boolean) => void
) {
  const followDoc = doc(foldCollection, fold.id, 'followers', user.id)
  return listenForValue(followDoc, (value) => {
    setFollow(!!value)
  })
}

export async function getFoldsByTags(tags: string[]) {
  if (tags.length === 0) return []

  const lowercaseTags = tags.map((tag) => tag.toLowerCase())
  const folds = await getValues<Fold>(
    // TODO: split into multiple queries if tags.length > 10.
    query(
      foldCollection,
      where('lowercaseTags', 'array-contains-any', lowercaseTags)
    )
  )

  return _.sortBy(folds, (fold) => -1 * fold.followCount)
}

export function listenForFoldsWithTags(
  tags: string[],
  setFolds: (folds: Fold[]) => void
) {
  const lowercaseTags = tags.map((tag) => tag.toLowerCase())
  const q =
    // TODO: split into multiple queries if tags.length > 10.
    query(
      foldCollection,
      where('lowercaseTags', 'array-contains-any', lowercaseTags)
    )

  return listenForValues<Fold>(q, (folds) => {
    const sorted = _.sortBy(folds, (fold) => -1 * fold.followCount)
    setFolds(sorted)
  })
}

export async function getFollowedFolds(userId: string) {
  const snapshot = await getDocs(
    query(collectionGroup(db, 'followers'), where('userId', '==', userId))
  )
  const foldIds = snapshot.docs.map(
    (doc) => doc.ref.parent.parent?.id as string
  )
  return foldIds
}
