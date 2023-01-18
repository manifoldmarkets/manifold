import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'

const PAGE_SIZE = 5

export const useRelatedMarkets = (contract: Contract) => {
  const [savedContracts, setSavedContracts] = useState<Contract[]>()
  const lastDistance = useRef(0)
  const page = useRef(0)
  const privateUser = usePrivateUser()
  const loadMore = useCallback(async () => {
    const relatedContracts = await db
      .rpc('get_related_contracts' as any, {
        cid: contract.id,
        count: PAGE_SIZE,
        minimum_distance: lastDistance.current,
      })
      .then((res) => {
        if (!res.data || res.data.length <= 0) return []
        const newContracts: Contract[] = []
        res.data.map((d: { data: Contract; distance: number }) => {
          newContracts.push(d.data)
        })
        lastDistance.current = res.data[res.data.length - 1].distance
        return newContracts
      })
    const groupContracts = contract.groupSlugs
      ? await db
          .rpc('search_contracts_by_group_slugs' as any, {
            group_slugs: contract.groupSlugs,
            lim: PAGE_SIZE,
            off: page.current * PAGE_SIZE,
          })
          .then((res) => {
            if (!res.data || res.data.length <= 0) return []

            const newContracts = res.data.map((d: { data: Contract }) => d.data)
            page.current++
            return newContracts
          })
      : []

    const shuffledContracts = relatedContracts
      .concat(groupContracts)
      .sort(() => Math.random() - 0.5)

    setSavedContracts((contracts) =>
      uniqBy(buildArray(contracts, shuffledContracts), (c) => c.id).filter(
        (c) => !isContractBlocked(privateUser, c)
      )
    )

    // get markets in the same group
  }, [contract.id, privateUser])

  useEffect(() => {
    loadMore()
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}
