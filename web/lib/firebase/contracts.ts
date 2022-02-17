import dayjs from 'dayjs'
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  where,
  collection,
  query,
  getDocs,
  orderBy,
  getDoc,
  updateDoc,
  limit,
} from 'firebase/firestore'
import _ from 'lodash'

import { app } from './init'
import { getValues, listenForValue, listenForValues } from './utils'
import { Contract } from '../../../common/contract'
import { getProbability } from '../../../common/calculate'
import { createRNG, shuffle } from '../../../common/util/random'
export type { Contract }

export function contractPath(contract: Contract) {
  return `/${contract.creatorUsername}/${contract.slug}`
}

export function contractMetrics(contract: Contract) {
  const { pool, createdTime, resolutionTime, isResolved } = contract

  const truePool = _.sum(Object.values(pool))

  const createdDate = dayjs(createdTime).format('MMM D')

  const resolvedDate = isResolved
    ? dayjs(resolutionTime).format('MMM D')
    : undefined

  return { truePool, createdDate, resolvedDate }
}

export function getBinaryProbPercent(contract: Contract) {
  const { totalShares, resolutionProbability } = contract

  const prob = resolutionProbability ?? getProbability(totalShares)
  const probPercent = Math.round(prob * 100) + '%'

  return probPercent
}

export function tradingAllowed(contract: Contract) {
  return (
    !contract.isResolved &&
    (!contract.closeTime || contract.closeTime > Date.now())
  )
}

const db = getFirestore(app)
export const contractCollection = collection(db, 'contracts')

// Push contract to Firestore
export async function setContract(contract: Contract) {
  const docRef = doc(db, 'contracts', contract.id)
  await setDoc(docRef, contract)
}

export async function updateContract(
  contractId: string,
  update: Partial<Contract>
) {
  const docRef = doc(db, 'contracts', contractId)
  await updateDoc(docRef, update)
}

export async function getContractFromId(contractId: string) {
  const docRef = doc(db, 'contracts', contractId)
  const result = await getDoc(docRef)

  return result.exists() ? (result.data() as Contract) : undefined
}

export async function getContractFromSlug(slug: string) {
  const q = query(contractCollection, where('slug', '==', slug))
  const snapshot = await getDocs(q)

  return snapshot.empty ? undefined : (snapshot.docs[0].data() as Contract)
}

export async function deleteContract(contractId: string) {
  const docRef = doc(db, 'contracts', contractId)
  await deleteDoc(docRef)
}

export async function listContracts(creatorId: string): Promise<Contract[]> {
  const q = query(
    contractCollection,
    where('creatorId', '==', creatorId),
    orderBy('createdTime', 'desc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => doc.data() as Contract)
}

export async function listAllContracts(): Promise<Contract[]> {
  const q = query(contractCollection, orderBy('createdTime', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => doc.data() as Contract)
}

export function listenForContracts(
  setContracts: (contracts: Contract[]) => void
) {
  const q = query(contractCollection, orderBy('createdTime', 'desc'))
  return listenForValues<Contract>(q, setContracts)
}

export function listenForContract(
  contractId: string,
  setContract: (contract: Contract | null) => void
) {
  const contractRef = doc(contractCollection, contractId)
  return listenForValue<Contract>(contractRef, setContract)
}

function chooseRandomSubset(contracts: Contract[], count: number) {
  const fiveMinutes = 5 * 60 * 1000
  const seed = Math.round(Date.now() / fiveMinutes).toString()
  shuffle(contracts, createRNG(seed))
  return contracts.slice(0, count)
}

const hotContractsQuery = query(
  contractCollection,
  where('isResolved', '==', false),
  where('visibility', '==', 'public'),
  orderBy('volume24Hours', 'desc'),
  limit(16)
)

export function listenForHotContracts(
  setHotContracts: (contracts: Contract[]) => void
) {
  return listenForValues<Contract>(hotContractsQuery, (contracts) => {
    const hotContracts = _.sortBy(
      chooseRandomSubset(contracts, 4),
      (contract) => contract.volume24Hours
    )
    setHotContracts(hotContracts)
  })
}

export async function getHotContracts() {
  const contracts = await getValues<Contract>(hotContractsQuery)
  return _.sortBy(
    chooseRandomSubset(contracts, 10),
    (contract) => -1 * contract.volume24Hours
  )
}

const closingSoonQuery = query(
  contractCollection,
  where('isResolved', '==', false),
  where('visibility', '==', 'public'),
  where('closeTime', '>', Date.now()),
  orderBy('closeTime', 'asc'),
  limit(6)
)

export async function getClosingSoonContracts() {
  const contracts = await getValues<Contract>(closingSoonQuery)
  return _.sortBy(
    chooseRandomSubset(contracts, 2),
    (contract) => contract.closeTime
  )
}
