import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { useEffect } from 'react'
import { usePersistentState, inMemoryStore } from './use-persistent-state'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { useEvent } from './use-event'
import { db } from 'web/lib/supabase/db'

const PAGE_SIZE = 20

export const useFeed = (
  user: User | null | undefined,
  key: string,
  options?: {
    binaryOnly?: boolean
  }
) => {
  const [savedContracts, setSavedContracts] = usePersistentState<
    Contract[] | undefined
  >(undefined, {
    key: `recommended-contracts-${user?.id}-${key}`,
    store: inMemoryStore(),
  })

  const privateUser = usePrivateUser()
  const userId = user?.id

  const loadMore = useEvent(() => {
    if (userId) {
      db.rpc('get_recommended_contracts', {
        uid: userId,
        n: PAGE_SIZE,
        excluded_contract_ids: savedContracts?.map((c) => c.id) ?? [],
      }).then((res) => {
        if (res.data) {
          console.log('got', res)
          const newContracts =
            (res.data as any).map((row: any) => row as Contract | undefined) ??
            []
          setSavedContracts((contracts) =>
            uniqBy(buildArray(contracts, newContracts), (c) => c.id)
          )
        }
      })
    }
  })

  useEffect(() => {
    loadMore()
  }, [loadMore])

  const filteredContracts = savedContracts?.filter(
    (c) =>
      !isContractBlocked(privateUser, c) &&
      (!options?.binaryOnly || c.outcomeType === 'BINARY')
  )

  return {
    contracts: filteredContracts,
    loadMore,
  }
}
