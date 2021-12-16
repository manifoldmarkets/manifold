import { useEffect, useState } from 'react'
import { Contract, listenForContract } from '../lib/firebase/contracts'

export const useContract = (contractId: string) => {
  const [contract, setContract] = useState<Contract | null | 'loading'>(
    'loading'
  )

  useEffect(() => {
    if (contractId) return listenForContract(contractId, setContract)
  }, [contractId])

  return contract
}

export const useContractWithPreload = (
  contractId: string,
  initial: Contract | null
) => {
  const [contract, setContract] = useState<Contract | null>(initial)

  useEffect(() => {
    if (contractId) return listenForContract(contractId, setContract)
  }, [contractId])

  return contract
}
