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
} from 'firebase/firestore'

export type Contract = {
  id: string // Chosen by creator; must be unique
  creatorId: string
  creatorName: string

  question: string
  description: string // More info about what the contract is about
  outcomeType: 'BINARY' // | 'MULTI' | 'interval' | 'date'
  // outcomes: ['YES', 'NO']
  seedAmounts: { YES: number; NO: number } // seedBets: [number, number]
  pot: { YES: number; NO: number }

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // If the question or description was changed
  closeTime?: number // When no more trading is allowed

  // isResolved: boolean
  resolutionTime?: 10293849 // When the contract creator resolved the market; 0 if unresolved
  resolution?: 'YES' | 'NO' | 'CANCEL' // Chosen by creator; must be one of outcomes
}

const db = getFirestore(app)
const contractCollection = collection(db, 'contracts')

// Push contract to Firestore
export async function setContract(contract: Contract) {
  const docRef = doc(db, 'contracts', contract.id)
  await setDoc(docRef, contract)
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
  const contracts: Contract[] = []
  snapshot.forEach((doc) => contracts.push(doc.data() as Contract))
  return contracts
}

export function listenForContract(
  contractId: string,
  setContract: (contract: Contract) => void
) {
  const contractRef = doc(contractCollection, contractId)
  return onSnapshot(contractRef, (contractSnap) => {
    setContract(contractSnap.data() as Contract)
  })
}
