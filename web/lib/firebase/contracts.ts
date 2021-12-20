import { app } from './init'
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  where,
  collection,
  query,
  getDocs,
  onSnapshot,
  orderBy,
  getDoc,
  limit,
} from 'firebase/firestore'
import dayjs from 'dayjs'

export type Contract = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string

  question: string
  description: string // More info about what the contract is about
  outcomeType: 'BINARY' // | 'MULTI' | 'interval' | 'date'
  // outcomes: ['YES', 'NO']

  startPool: { YES: number; NO: number }
  pool: { YES: number; NO: number }
  dpmWeights: { YES: number; NO: number }

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
  closeTime?: number // When no more trading is allowed

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: 'YES' | 'NO' | 'CANCEL' // Chosen by creator; must be one of outcomes
}

export function path(contract: Contract) {
  // For now, derive username from creatorName
  return `/${contract.creatorUsername}/${contract.slug}`
}

export function compute(contract: Contract) {
  const { pool, startPool, createdTime, resolutionTime, isResolved } = contract
  const volume = pool.YES + pool.NO - startPool.YES - startPool.NO
  const prob = pool.YES ** 2 / (pool.YES ** 2 + pool.NO ** 2)
  const probPercent = Math.round(prob * 100) + '%'
  const createdDate = dayjs(createdTime).format('MMM D')
  const resolvedDate = isResolved
    ? dayjs(resolutionTime).format('MMM D')
    : undefined
  return { volume, probPercent, createdDate, resolvedDate }
}

const db = getFirestore(app)
const contractCollection = collection(db, 'contracts')

// Push contract to Firestore
export async function setContract(contract: Contract) {
  const docRef = doc(db, 'contracts', contract.id)
  await setDoc(docRef, contract)
}

export async function pushNewContract(contract: Omit<Contract, 'id'>) {
  const newContractRef = doc(contractCollection)
  const fullContract: Contract = { ...contract, id: newContractRef.id }

  await setDoc(newContractRef, fullContract)
  return fullContract
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
  const q = query(contractCollection, orderBy('createdTime', 'desc'), limit(99))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => doc.data() as Contract)
}

export function listenForContracts(
  setContracts: (contracts: Contract[]) => void
) {
  const q = query(contractCollection, orderBy('createdTime', 'desc'), limit(99))
  return onSnapshot(q, (snap) => {
    setContracts(snap.docs.map((doc) => doc.data() as Contract))
  })
}

export function listenForContract(
  contractId: string,
  setContract: (contract: Contract | null) => void
) {
  const contractRef = doc(contractCollection, contractId)
  return onSnapshot(contractRef, (contractSnap) => {
    setContract((contractSnap.data() ?? null) as Contract | null)
  })
}
