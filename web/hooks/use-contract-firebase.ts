import { listenForContract } from 'web/lib/firebase/contracts'
import { useStore } from './use-store'

export const useContract = (contractId: string | undefined) => {
  return useStore(contractId, listenForContract)
}
