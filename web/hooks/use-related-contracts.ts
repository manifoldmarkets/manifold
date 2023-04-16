import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { MutableRefObject, useEffect, useRef, useState } from 'react'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { useEvent } from './use-event'

const GROUPS_PAGE_SIZE = 6
// const RELATED_PAGE_SIZE = 10

export const useRelatedMarkets = (
  contract: Contract,
  initialContracts: Contract[]
) => {
  const [savedContracts, setSavedContracts] = useState(initialContracts)
  // const relatedPage = useRef(0)
  const groupsPage = useRef(0)
  const creatorPage = useRef(0)
  const privateUser = usePrivateUser()
  let hasLoadedMoreContracts = false

  const loadMore = useEvent(async () => {
    const setContracts = (
      contracts: Contract[],
      page: MutableRefObject<number>
    ) => {
      setSavedContracts((sc) => {
        const newContracts = uniqBy(buildArray(sc, contracts), (c) => c.id)
        page.current += 1
        const filteredContracts = newContracts.filter(
          (c) => !isContractBlocked(privateUser, c) && c.id !== contract.id
        )
        if (filteredContracts.length > sc.length) {
          hasLoadedMoreContracts = true
        }
        return filteredContracts
      })
    }

    if (contract.groupSlugs?.length) {
      const groupSlugsToUse = contract.groupSlugs.filter(
        (slug) => !['spam', 'improperly-resolved'].includes(slug)
      )
      const [{ data: groupSlugData }, { data: creatorData }] =
        await Promise.all([
          db.rpc('search_contracts_by_group_slugs' as any, {
            group_slugs: groupSlugsToUse,
            lim: GROUPS_PAGE_SIZE,
            start: groupsPage.current * GROUPS_PAGE_SIZE,
          }),
          db.rpc('search_contracts_by_group_slugs_for_creator' as any, {
            creator_id: contract.creatorId,
            group_slugs: groupSlugsToUse,
            lim: GROUPS_PAGE_SIZE,
            start: creatorPage.current * GROUPS_PAGE_SIZE,
          }),
        ])

      if (groupSlugData) setContracts(groupSlugData, groupsPage)
      if (creatorData) setContracts(creatorData, creatorPage)
    } else {
      // const contracts = await getRelatedContracts(contract, RELATED_PAGE_SIZE)
      // setContracts(contracts, relatedPage)
    }
    return hasLoadedMoreContracts
  })

  useEffect(() => {
    if (initialContracts.length === 0) loadMore()
  }, [])

  return { contracts: savedContracts, loadMore }
}

export async function getRelatedContracts(contract: Contract, count = 10) {
  const { data } = await db.rpc('closest_contract_embeddings', {
    input_contract_id: contract.id,
    match_count: count,
    similarity_threshold: 0.7,
  })
  const contracts = (data ?? []).map((c) => (c as any).data)
  return contracts
}
