import { uniqBy } from 'lodash'
import { Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import { buildArray } from 'common/util/array'
import { isContractBlocked } from 'web/lib/firebase/users'
import { db } from 'web/lib/supabase/db'
import { usePrivateUser } from 'web/hooks/use-user'
import { useEvent } from 'web/hooks/use-event'
import { getRelatedPoliticsContracts } from 'common/supabase/related-contracts'

const RELATED_PAGE_SIZE = 10

export const useRelatedPoliticalMarkets = (
  contract: Contract,
  initialContracts: Contract[]
) => {
  const [savedContracts, setSavedContracts] = useState(initialContracts)
  const privateUser = usePrivateUser()

  let hasLoadedMoreContracts = false

  const loadMore = useEvent(async () => {
    const setContracts = (contracts: Contract[]) => {
      setSavedContracts((sc) => {
        const newContracts = uniqBy(buildArray(sc, contracts), (c) => c.id)
        const filteredContracts = newContracts.filter(
          (c) => !isContractBlocked(privateUser, c) && c.id !== contract.id
        )
        if (filteredContracts.length > sc.length) {
          hasLoadedMoreContracts = true
        }
        return filteredContracts
      })
    }

    const data = await getRelatedPoliticsContracts(
      contract,
      RELATED_PAGE_SIZE,
      savedContracts.length,
      db
    )
    setContracts(data)

    return hasLoadedMoreContracts
  })

  useEffect(() => {
    if (initialContracts.length === 0) loadMore()
  }, [])

  return { contracts: savedContracts, loadMore }
}
