import { collection, doc, query, updateDoc, where } from 'firebase/firestore'
import { Fold } from '../../../common/fold'
import { Contract, contractCollection } from './contracts'
import { db } from './init'
import { getValues, listenForValue, listenForValues } from './utils'

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

export async function listAllFolds() {
  return getValues<Fold>(foldCollection)
}

export function listenForFolds(setFolds: (folds: Fold[]) => void) {
  return listenForValues(foldCollection, setFolds)
}

export async function getFoldBySlug(slug: string) {
  const q = query(foldCollection, where('slug', '==', slug))
  const folds = await getValues<Fold>(q)

  return folds.length === 0 ? null : folds[0]
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
    tags.length > 0
      ? getValues<Contract>(
          query(contractCollection, where('tags', 'array-contains-any', tags))
        )
      : [],

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

export function listenForFold(
  foldId: string,
  setFold: (fold: Fold | null) => void
) {
  return listenForValue(doc(foldCollection, foldId), setFold)
}
