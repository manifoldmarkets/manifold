import { useEffect } from 'react'
import { useFirestoreDocumentData } from '@react-query-firebase/firestore'
import {
  Contract,
  contracts,
  getContractFromId,
  listenForContract,
} from 'web/lib/firebase/contracts'
import { useStateCheckEquality } from './use-state-check-equality'
import { doc, DocumentData } from 'firebase/firestore'
import { useQuery } from 'react-query'

export const useContract = (contractId: string) => {
  const result = useFirestoreDocumentData<DocumentData, Contract>(
    ['contracts', contractId],
    doc(contracts, contractId),
    { subscribe: true, includeMetadataChanges: true }
  )

  return result.isLoading ? undefined : result.data
}

export const useContractsFromIds = (contractIds: string[]) => {
  const contractResult = useQuery(['contracts', contractIds], () =>
    Promise.all(contractIds.map(getContractFromId))
  )
  const contracts = contractResult.data?.filter(
    (contract): contract is Contract => !!contract
  )

  return contractResult.isLoading ? undefined : contracts
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
