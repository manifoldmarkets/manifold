import { mapValues } from 'lodash'
import { useEffect, useState } from 'react'
import { Contract } from 'common/contract'
import { trackView } from 'web/lib/firebase/tracking'
import { useIsVisible } from './use-is-visible'

export const useSeenContracts = () => {
  const [seenContracts, setSeenContracts] = useState<{
    [contractId: string]: number
  }>({})

  useEffect(() => {
    setSeenContracts(getSeenContracts())
  }, [])

  return seenContracts
}

export const useSaveSeenContract = (
  elem: HTMLElement | null,
  contract: Contract
) => {
  const isVisible = useIsVisible(elem)

  useEffect(() => {
    if (isVisible) {
      const newSeenContracts = {
        ...getSeenContracts(),
        [contract.id]: Date.now(),
      }
      localStorage.setItem(key, JSON.stringify(newSeenContracts))

      trackView(contract.id)
    }
  }, [isVisible, contract])
}

const key = 'feed-seen-contracts'

const getSeenContracts = () => {
  return mapValues(
    JSON.parse(localStorage.getItem(key) ?? '{}'),
    (time) => +time
  )
}
