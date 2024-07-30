import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { MutableRefObject, useEffect, useRef, useState } from 'react'
import { buildArray } from 'common/util/array'
import { usePrivateUser } from './use-user'
import { isContractBlocked } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { useEvent } from './use-event'
import { convertContract } from 'common/supabase/contracts'

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

    const [{ data: groupSlugData }, { data: creatorData }] = await Promise.all([
      db.rpc('get_related_contracts_by_group' as any, {
        p_contract_id: contract.id,
        lim: GROUPS_PAGE_SIZE,
        start: groupsPage.current * GROUPS_PAGE_SIZE,
      }),
      db.rpc('get_related_contracts_by_group_and_creator' as any, {
        p_contract_id: contract.id,
        lim: GROUPS_PAGE_SIZE,
        start: creatorPage.current * GROUPS_PAGE_SIZE,
      }),
    ])
    if (groupSlugData)
      setContracts(groupSlugData.map(convertContract), groupsPage)
    if (creatorData) setContracts(creatorData.map(convertContract), creatorPage)
    return hasLoadedMoreContracts
  })

  useEffect(() => {
    if (initialContracts.length === 0) loadMore()
  }, [])

  return { contracts: savedContracts, loadMore }
}
