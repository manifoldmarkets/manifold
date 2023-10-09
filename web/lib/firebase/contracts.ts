import { Contract } from 'common/contract'
import { doc, updateDoc } from 'firebase/firestore'
import { coll, listenForValue } from './utils'

export const contracts = coll<Contract>('contracts')

export type { Contract }

export async function updateContract(
  contractId: string,
  update: Partial<Contract>
) {
  await updateDoc(doc(contracts, contractId), update)
}

export function listenForContract(
  contractId: string,
  setContract: (contract: Contract | null) => void
) {
  const contractRef = doc(contracts, contractId)
  return listenForValue<Contract>(contractRef, setContract)
}
