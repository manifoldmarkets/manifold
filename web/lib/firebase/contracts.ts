import { Contract } from 'common/contract'
import { doc } from 'firebase/firestore'
import { coll, listenForValue } from './utils'

export const contracts = coll<Contract>('contracts')

export type { Contract }

export function listenForContract(
  contractId: string,
  setContract: (contract: Contract | null) => void
) {
  const contractRef = doc(contracts, contractId)
  return listenForValue<Contract>(contractRef, setContract)
}
