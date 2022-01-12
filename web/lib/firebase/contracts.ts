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
  onSnapshot,
  orderBy,
  getDoc,
  updateDoc,
  limit,
} from 'firebase/firestore'

import { app } from './init'
import { getValues, listenForValues } from './utils'
import { Contract } from '../../../common/contract'
import { getProbability } from '../../../common/calculate'
export type { Contract }

export function contractPath(contract: Contract) {
  // For now, derive username from creatorName
  return `/${contract.creatorUsername}/${contract.slug}`
}

export function contractMetrics(contract: Contract) {
  const {
    pool,
    phantomShares,
    totalShares,
    createdTime,
    resolutionTime,
    isResolved,
  } = contract

  const truePool = pool.YES + pool.NO
  const prob = getProbability(totalShares)
  const probPercent = Math.round(prob * 100) + '%'

  const startProb = getProbability(phantomShares)

  const createdDate = dayjs(createdTime).format('MMM D')

  const resolvedDate = isResolved
    ? dayjs(resolutionTime).format('MMM D')
    : undefined

  return { truePool, probPercent, startProb, createdDate, resolvedDate }
}

const db = getFirestore(app)
const contractCollection = collection(db, 'contracts')

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
  const q = query(contractCollection, orderBy('createdTime', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => doc.data() as Contract)
}

export function listenForContracts(
  setContracts: (contracts: Contract[]) => void
) {
  const q = query(contractCollection, orderBy('createdTime', 'desc'))
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

const hotContractsQuery = query(
  contractCollection,
  where('isResolved', '==', false),
  orderBy('volume24Hours', 'desc'),
  limit(4)
)

export function listenForHotContracts(
  setHotContracts: (contracts: Contract[]) => void
) {
  return listenForValues<Contract>(hotContractsQuery, setHotContracts)
}

export function getHotContracts() {
  return getValues<Contract>(hotContractsQuery)
}
