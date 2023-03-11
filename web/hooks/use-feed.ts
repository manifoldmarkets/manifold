import { uniqBy, shuffle } from 'lodash'
import { CPMMBinaryContract } from 'common/contract'
import { User } from 'common/user'
import { useEffect } from 'react'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { db } from 'web/lib/supabase/db'
import { buildArray } from 'common/util/array'
import { useShouldBlockDestiny, usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { useEvent } from './use-event'
import { DESTINY_GROUP_SLUGS } from 'common/envs/constants'

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
      db.rpc('get_recommended_contracts' as any, {
        uid: userId,
        n: PAGE_SIZE,
        excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
      }).then((res) => {
        const newContracts = shuffle(
          (res.data as CPMMBinaryContract[] | undefined) ?? []
        )
        setSavedContracts((contracts) =>
          uniqBy(buildArray(contracts, newContracts), (c) => c.id)
        )
      })
    }
  })

  useEffect(() => {
    loadMore()
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
