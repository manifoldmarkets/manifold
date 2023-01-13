import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useCallback, useEffect } from 'react'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { db } from 'web/lib/supabase/db'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'

const PAGE_SIZE = 20

export const useFeed = (user: User | null | undefined, key: string) => {
  const [savedContracts, setSavedContracts] = usePersistentState<
    Contract[] | undefined
  >(undefined, {
    key: `recommended-contracts-${user?.id}-${key}`,
    store: inMemoryStore(),
  })

  const privateUser = usePrivateUser()
  const userId = user?.id

  const loadMore = useCallback(() => {
    if (userId) {
      db.rpc('get_recommended_contracts' as any, {
        uid: userId,
        count: PAGE_SIZE,
      }).then((res) => {
        const newContracts = res.data as Contract[] | undefined
        setSavedContracts((contracts) =>
          uniqBy(buildArray(contracts, newContracts), (c) => c.id).filter(
            (c) => !isContractBlocked(privateUser, c)
          )
        )
      })
    }
  }, [userId, setSavedContracts, privateUser])

  useEffect(() => {
    loadMore()
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}
