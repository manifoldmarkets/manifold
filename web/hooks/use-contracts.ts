import _ from 'lodash'
import { useEffect, useState } from 'react'
import {
  Contract,
  listenForContracts,
  listenForHotContracts,
} from '../lib/firebase/contracts'

export const useContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useHotContracts = () => {
  const [hotContracts, setHotContracts] = useState<Contract[] | undefined>()

  useEffect(() => listenForHotContracts(setHotContracts), [])

  return hotContracts
}
