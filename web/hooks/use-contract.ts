import { useEffect, useState } from 'react'
import {
  Contract,
  getContractFromSlug,
  listenForContract,
} from '../lib/firebase/contracts'

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
  slug: string,
  initial: Contract | null
) => {
  const [contract, setContract] = useState<Contract | null>(initial)
  const [contractId, setContractId] = useState<string | undefined | null>(
    initial?.id
  )

  useEffect(() => {
    if (contractId) return listenForContract(contractId, setContract)

    if (contractId !== null)
      getContractFromSlug(slug).then((c) => setContractId(c?.id || null))
  }, [contractId, slug])

  return contract
}
