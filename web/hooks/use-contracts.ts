import _ from 'lodash'
import { useEffect, useState } from 'react'
import {
  Contract,
  getActiveContracts,
  listenForActiveContracts,
  listenForContracts,
  listenForHotContracts,
  listenForInactiveContracts,
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
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForActiveContracts(setContracts)
  }, [])

  return contracts
}

export const useGetActiveContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    getActiveContracts().then(setContracts)
  }, [])

  return contracts
}

export const useInactiveContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForInactiveContracts(setContracts)
  }, [])

  return contracts
}

export const useUpdatedContracts = (initialContracts: Contract[]) => {
  const [contracts, setContracts] = useState(initialContracts)

  useEffect(() => {
    return listenForContracts((newContracts) => {
      const contractMap = _.fromPairs(newContracts.map((c) => [c.id, c]))
      setContracts(initialContracts.map((c) => contractMap[c.id]))
    })
  }, [initialContracts])

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
