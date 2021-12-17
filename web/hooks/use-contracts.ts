import { useEffect, useState } from 'react'
import { Contract, listenForContracts } from '../lib/firebase/contracts'

export const useContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | 'loading'>('loading')

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}
