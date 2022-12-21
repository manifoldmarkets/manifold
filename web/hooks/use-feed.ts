import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useEffect } from 'react'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { useSwipes } from './use-swipes'
import { useUserRecommendedMarkets } from './use-user'

export const useFeed = (user: User | null | undefined, count: number) => {
  const [savedContracts, setSavedContracts] = usePersistentState<
    Contract[] | undefined
  >(undefined, { key: 'home-your-feed' + count, store: inMemoryStore() })

  const alreadySwipedContractIds = useSwipes()

  const computedContracts = useUserRecommendedMarkets(
    user?.id,
    count,
    alreadySwipedContractIds
  )

  useEffect(() => {
    if (computedContracts && !savedContracts)
      setSavedContracts(computedContracts)
  }, [computedContracts, savedContracts, setSavedContracts])

  // Show only the first loaded batch of contracts, so users can come back to them.
  return savedContracts ?? computedContracts
}
