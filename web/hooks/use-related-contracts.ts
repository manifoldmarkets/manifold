import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { useCallback, useEffect, useRef, useState } from 'react'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'

const GROUPS_PAGE_SIZE = 6
const RELATED_PAGE_SIZE = 3

export const useRelatedMarkets = (contract: Contract) => {
  const [savedContracts, setSavedContracts] = useState<Contract[]>()
  const page = useRef(0)
  const privateUser = usePrivateUser()
  const loadMore = useCallback(async () => {
    const relatedContracts = await db
      .rpc('get_related_contracts' as any, {
        cid: contract.id,
        lim: RELATED_PAGE_SIZE,
        start: page.current * RELATED_PAGE_SIZE,
      })
      .then((res) => res.data ?? ([] as Contract[]))
    const groupContracts = contract.groupSlugs
      ? await db
          .rpc('search_contracts_by_group_slugs' as any, {
            group_slugs: contract.groupSlugs,
            lim: GROUPS_PAGE_SIZE,
            start: page.current * GROUPS_PAGE_SIZE,
          })
          .then((res) =>
            ((res.data ?? []) as Contract[]).filter((c) => c.id !== contract.id)
          )
      : []

    const shuffledContracts = relatedContracts
      .concat(groupContracts)
      .sort(() => Math.random() - 0.5)

    setSavedContracts((contracts) => {
      const newContracts = uniqBy(
        buildArray(contracts, shuffledContracts),
        (c) => c.id
      )
      // if we actually got a new batch of contracts, increment the page
      if (newContracts.length > (contracts?.length ?? 0)) page.current += 1

      return newContracts.filter((c) => !isContractBlocked(privateUser, c))
    })

    // get markets in the same group
  }, [contract.groupSlugs, contract.id, privateUser])

  useEffect(() => {
    loadMore()
  }, [loadMore])

  return { contracts: savedContracts, loadMore }
}
