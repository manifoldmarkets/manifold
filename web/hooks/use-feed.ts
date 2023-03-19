import { uniqBy } from 'lodash'
import { CPMMBinaryContract } from 'common/contract'
import { User } from 'common/user'
import { useEffect } from 'react'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { buildArray } from 'common/util/array'
import { useShouldBlockDestiny, usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { useEvent } from './use-event'
import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'
import { getRecommendedContracts } from 'web/lib/firebase/api'

const PAGE_SIZE = 20

export const useFeed = (user: User | null | undefined, key: string) => {
  const [savedContracts, setSavedContracts] = usePersistentState<
    CPMMBinaryContract[] | undefined
  >(undefined, {
    key: `recommended-contracts-${user?.id}-${key}`,
    store: inMemoryStore(),
  })

  const privateUser = usePrivateUser()
  const userId = user?.id

  const loadMore = useEvent(() => {
    if (userId) {
      getRecommendedContracts({
        excludedContractIds: savedContracts?.map((c) => c.id) ?? [],
      }).then((res) => {
        console.log('got', res)
        const newContracts =
          (res.data as CPMMBinaryContract[] | undefined) ?? []
        setSavedContracts((contracts) =>
          uniqBy(buildArray(contracts, newContracts), (c) => c.id)
        )
      })
    }
  })

  useEffect(() => {
    setTimeout(loadMore, 1000)
  }, [loadMore])

  const shouldBlockDestiny = useShouldBlockDestiny(user?.id)
  const filteredContracts = savedContracts?.filter(
    (c) =>
      !isContractBlocked(privateUser, c) &&
      (!shouldBlockDestiny ||
        !c.groupSlugs?.some((s) => DESTINY_GROUP_SLUGS.includes(s)))
  )

  return {
    contracts: filteredContracts,
    loadMore,
  }
}
