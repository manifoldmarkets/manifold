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
import { Binary, Contract, FullContract } from '../../../common/contract'
import { getDpmProbability } from '../../../common/calculate-dpm'
import { createRNG, shuffle } from '../../../common/util/random'
import { getCpmmProbability } from '../../../common/calculate-cpmm'
import { formatMoney, formatPercent } from '../../../common/util/format'
import { DAY_MS } from '../../../common/util/time'
export type { Contract }

export function contractPath(contract: Contract) {
  return `/${contract.creatorUsername}/${contract.slug}`
}

export function homeContractPath(contract: Contract) {
  return `/home?c=${contract.slug}`
}

export function contractMetrics(contract: Contract) {
  const { createdTime, resolutionTime, isResolved } = contract

  const createdDate = dayjs(createdTime).format('MMM D')

  const resolvedDate = isResolved
    ? dayjs(resolutionTime).format('MMM D')
    : undefined

  const volumeLabel = `${formatMoney(contract.volume)} volume`

  return { volumeLabel, createdDate, resolvedDate }
}

export function getBinaryProb(contract: FullContract<any, Binary>) {
  const { totalShares, pool, p, resolutionProbability, mechanism } = contract

  return (
    resolutionProbability ??
    (mechanism === 'cpmm-1'
      ? getCpmmProbability(pool, p)
      : getDpmProbability(totalShares))
  )
}

export function getBinaryProbPercent(contract: FullContract<any, Binary>) {
  return formatPercent(getBinaryProb(contract))
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

const activeContractsQuery = query(
  contractCollection,
  where('isResolved', '==', false),
  where('visibility', '==', 'public'),
  where('volume7Days', '>', 0)
)

export function getActiveContracts() {
  return getValues<Contract>(activeContractsQuery)
}

export function listenForActiveContracts(
  setContracts: (contracts: Contract[]) => void
) {
  return listenForValues<Contract>(activeContractsQuery, setContracts)
}

const inactiveContractsQuery = query(
  contractCollection,
  where('isResolved', '==', false),
  where('closeTime', '>', Date.now()),
  where('visibility', '==', 'public'),
  where('volume24Hours', '==', 0)
)

export function getInactiveContracts() {
  return getValues<Contract>(inactiveContractsQuery)
}

export function listenForInactiveContracts(
  setContracts: (contracts: Contract[]) => void
) {
  return listenForValues<Contract>(inactiveContractsQuery, setContracts)
}

const newContractsQuery = query(
  contractCollection,
  where('isResolved', '==', false),
  where('volume7Days', '==', 0),
  where('createdTime', '>', Date.now() - 7 * DAY_MS)
)

export function listenForNewContracts(
  setContracts: (contracts: Contract[]) => void
) {
  return listenForValues<Contract>(newContractsQuery, setContracts)
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

const getContractsQuery = (startTime: number, endTime: number) =>
  query(
    collection(db, 'contracts'),
    where('createdTime', '>=', startTime),
    where('createdTime', '<', endTime),
    orderBy('createdTime', 'asc')
  )

const DAY_IN_MS = 24 * 60 * 60 * 1000

export async function getDailyContracts(
  startTime: number,
  numberOfDays: number
) {
  const query = getContractsQuery(
    startTime,
    startTime + DAY_IN_MS * numberOfDays
  )
  const contracts = await getValues<Contract>(query)

  const contractsByDay = _.range(0, numberOfDays).map(() => [] as Contract[])
  for (const contract of contracts) {
    const dayIndex = Math.floor((contract.createdTime - startTime) / DAY_IN_MS)
    contractsByDay[dayIndex].push(contract)
  }

  return contractsByDay
}
