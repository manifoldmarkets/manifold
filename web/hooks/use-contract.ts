import { useEffect } from 'react'
import { useFirestoreDocumentData } from '@react-query-firebase/firestore'
import {
  Contract,
  contracts,
  listenForContract,
} from 'web/lib/firebase/contracts'
import { useStateCheckEquality } from './use-state-check-equality'
import { doc, DocumentData } from 'firebase/firestore'

export const useContract = (contractId: string) => {
  const result = useFirestoreDocumentData<DocumentData, Contract>(
    ['contracts', contractId],
    doc(contracts, contractId),
    { subscribe: true, includeMetadataChanges: true }
  )

  return result.isLoading ? undefined : result.data
}

export const useContractWithPreload = (
  initial: Contract | null | undefined
) => {
  const [contract, setContract] = useStateCheckEquality<
    Contract | null | undefined
  >(initial)
  const contractId = initial?.id

  useEffect(() => {
    if (contractId) return listenForContract(contractId, setContract)
  }, [contractId, setContract])

  return contract
}
