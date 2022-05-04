import _ from 'lodash'
import { useEffect, useRef, useState } from 'react'
import {
  Contract,
  listenForActiveContracts,
  listenForContract,
  listenForContracts,
  listenForHotContracts,
  listenForInactiveContracts,
  listenForNewContracts,
} from '../lib/firebase/contracts'
import { listenForTaggedContracts } from '../lib/firebase/folds'

export const useContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useActiveContracts = () => {
  const [activeContracts, setActiveContracts] = useState<
    Contract[] | undefined
  >()
  const [newContracts, setNewContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForActiveContracts(setActiveContracts)
  }, [])

  useEffect(() => {
    return listenForNewContracts(setNewContracts)
  }, [])

  if (!activeContracts || !newContracts) return undefined

  return [...activeContracts, ...newContracts]
}

export const useInactiveContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForInactiveContracts(setContracts)
  }, [])

  return contracts
}

export const useTaggedContracts = (tags: string[] | undefined) => {
  const [contracts, setContracts] = useState<Contract[] | undefined>(
    tags && tags.length === 0 ? [] : undefined
  )
  const tagsKey = tags?.map((tag) => tag.toLowerCase()).join(',') ?? ''

  useEffect(() => {
    if (!tags || tags.length === 0) return
    return listenForTaggedContracts(tags, setContracts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsKey])

  return contracts
}

export const useHotContracts = () => {
  const [hotContracts, setHotContracts] = useState<Contract[] | undefined>()

  useEffect(() => listenForHotContracts(setHotContracts), [])

  return hotContracts
}

export const useUpdatedContracts = (contracts: Contract[] | undefined) => {
  const [__, triggerUpdate] = useState(0)
  const contractDict = useRef<{ [id: string]: Contract }>({})

  useEffect(() => {
    if (contracts === undefined) return

    contractDict.current = _.fromPairs(contracts.map((c) => [c.id, c]))

    const disposes = contracts.map((contract) => {
      const { id } = contract

      return listenForContract(id, (contract) => {
        const curr = contractDict.current[id]
        if (!_.isEqual(curr, contract)) {
          contractDict.current[id] = contract as Contract
          triggerUpdate((n) => n + 1)
        }
      })
    })

    triggerUpdate((n) => n + 1)

    return () => {
      disposes.forEach((dispose) => dispose())
    }
  }, [!!contracts])

  return contracts && Object.keys(contractDict.current).length > 0
    ? contracts.map((c) => contractDict.current[c.id])
    : undefined
}
