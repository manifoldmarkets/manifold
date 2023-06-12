import { listenForContract } from 'web/lib/firebase/contracts'
import { useStore } from './use-store'

export const useContractFirebase = (contractId: string | undefined) => {
  return useStore(contractId, listenForContract)
}
