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

export const useContractWithPreload = (initial: Contract | null) => {
  const [contract, setContract] = useState<Contract | null>(initial)
  const contractId = initial?.id

  useEffect(() => {
    if (contractId) return listenForContract(contractId, setContract)
  }, [contractId])

  return contract
}
