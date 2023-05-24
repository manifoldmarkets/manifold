import { getDisplayProbability } from 'common/calculate'
import { getLiquidity } from 'common/calculate-cpmm-multi'
import { BinaryContract, Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { formatMoney, formatPercent } from 'common/util/format'
import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { sum } from 'lodash'
import { coll } from './utils'

export const contracts = coll<Contract>('contracts')

export type { Contract }

// Push contract to Firestore
export async function setContract(contract: Contract) {
  await setDoc(doc(contracts, contract.id), contract)
}

export async function updateContract(
  contractId: string,
  update: Partial<Contract>
) {
  await updateDoc(doc(contracts, contractId), update)
}

export async function followContract(contractId: string, userId: string) {
  const followDoc = doc(collection(contracts, contractId, 'follows'), userId)
  return await setDoc(followDoc, {
    id: userId,
    createdTime: Date.now(),
  })
}

export async function unFollowContract(contractId: string, userId: string) {
  const followDoc = doc(collection(contracts, contractId, 'follows'), userId)
  await deleteDoc(followDoc)
}
