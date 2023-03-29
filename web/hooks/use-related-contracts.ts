import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { MutableRefObject, useEffect, useRef, useState } from 'react'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { useEvent } from './use-event'

const GROUPS_PAGE_SIZE = 6
const RELATED_PAGE_SIZE = 10

export const useRelatedMarkets = (
  contract: Contract,
  initialContracts: Contract[]
) => {
  const [savedContracts, setSavedContracts] = useState(initialContracts)
  const relatedPage = useRef(0)
  const groupsPage = useRef(0)
  const creatorPage = useRef(0)
  const privateUser = usePrivateUser()
  const loadMore = useEvent(async () => {
    const setContracts = (
      contracts: Contract[],
      page: MutableRefObject<number>
    ) => {
      setSavedContracts((sc) => {
        const newContracts = uniqBy(buildArray(sc, contracts), (c) => c.id)
        page.current += 1
        return newContracts.filter(
          (c) => !isContractBlocked(privateUser, c) && c.id !== contract.id
        )
      })
    }

    if (contract.groupSlugs?.length) {
      const groupSlugsToUse = contract.groupSlugs.filter(
        (slug) => !['spam', 'improperly-resolved'].includes(slug)
      )
      const [{ data: groupSlugData }, { data: creatorData }, relatedData] =
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
          getRelatedContracts(
            contract,
            RELATED_PAGE_SIZE,
            savedContracts.map((c) => c.id)
          ),
        ])

      if (groupSlugData) setContracts(groupSlugData, groupsPage)
      if (creatorData) setContracts(creatorData, creatorPage)
      // Append related contracts last as they tend to be less relevant.
      if (relatedData) setContracts(relatedData, relatedPage)
    } else {
      const contracts = await getRelatedContracts(
        contract,
        RELATED_PAGE_SIZE,
        savedContracts.map((c) => c.id)
      )
      setContracts(contracts, relatedPage)
    }
  })

  useEffect(() => {
    if (initialContracts.length === 0) loadMore()
  }, [])

  return { contracts: savedContracts, loadMore }
}

export async function getRelatedContracts(
  contract: Contract,
  count = 10,
  excludedContractIds: string[] = []
) {
  const { data } = await db
    .from('related_contracts')
    .select('*')
    .filter('from_contract_id', 'eq', contract.id)
    .not('contract_id', 'in', `(${excludedContractIds.join(',')})`)
    .order('distance', { ascending: true })
    .limit(count)
  const contracts = (data ?? []).map((c) => c.data)
  return contracts
}
