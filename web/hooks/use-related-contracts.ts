import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { useCallback, useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'

const PAGE_SIZE = 20

export const useRelatedMarkets = (contractId: string) => {
  const [savedContracts, setSavedContracts] = useState<Contract[]>()
  const privateUser = usePrivateUser()
  const loadMore = useCallback(() => {
    db.rpc('get_related_contracts' as any, {
      cid: contractId,
      count: PAGE_SIZE,
    }).then((res) => {
      const newContracts = res.data as Contract[] | undefined
      setSavedContracts((contracts) =>
        uniqBy(buildArray(contracts, newContracts), (c) => c.id).filter(
          (c) => !isContractBlocked(privateUser, c)
        )
      )
    })
  }, [contractId, privateUser])

  useEffect(() => {
    loadMore()
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}
