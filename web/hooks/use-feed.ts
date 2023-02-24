import { uniqBy } from 'lodash'
import { CPMMBinaryContract } from 'common/contract'
import { User } from 'common/user'
import { useCallback, useEffect, useMemo } from 'react'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { db } from 'web/lib/supabase/db'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'

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

  const loadMore = useCallback(() => {
    if (userId) {
      db.rpc('get_recommended_contracts' as any, {
        uid: userId,
        n: PAGE_SIZE,
        excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
      }).then((res) => {
        const newContracts = res.data as CPMMBinaryContract[] | undefined
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

  return useMemo(
    () => ({ contracts: savedContracts, loadMore }),
    [savedContracts, loadMore]
  )
}
