import { type Contract } from 'common/contract'
import { useEffect, useRef, useState } from 'react'
import { getContract, getContracts } from 'common/supabase/contracts'
import { getPublicContractIdsInTopics } from 'web/lib/supabase/contracts'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { difference, uniqBy } from 'lodash'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useIsPageVisible } from './use-page-visible'
import { api } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'
import { useBatchedGetter } from 'client-common/hooks/use-batched-getter'
import { queryHandlers } from 'web/lib/supabase/batch-query-handlers'
import { useContractUpdates } from 'client-common/hooks/use-contract-updates'

export const usePublicContracts = (
  contractIds: string[] | undefined,
  topicSlugs?: string[],
  ignoreSlugs?: string[]
) => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffectCheckEquality(() => {
    // Only query new ids
    const newIds = difference(
      contractIds ?? [],
      contracts?.map((c) => c.id) ?? []
    )
    if (newIds.length == 0) return
    if (topicSlugs) {
      getPublicContractIdsInTopics(newIds, topicSlugs, ignoreSlugs).then(
        (result) => {
          setContracts((old) => uniqBy([...result, ...(old ?? [])], 'id'))
        }
      )
    } else
      getContracts(db, newIds, 'id', true).then((result) => {
        setContracts((old) => uniqBy([...result, ...(old ?? [])], 'id'))
      })
  }, [contractIds, topicSlugs, ignoreSlugs])

  return contracts
}

export const useContracts = (
  contractIds: string[],
  pk: 'id' | 'slug' = 'id',
  initial: Contract[] = []
) => {
  const [contracts, setContracts] = useState(initial)

  useEffectCheckEquality(() => {
    if (contractIds) {
      getContracts(db, contractIds, pk).then((result) => {
        setContracts(result)
      })
    }
  }, [contractIds])

  return contracts
}

export const useContract = (contractId: string | undefined) => {
  const [contract, setContract] = useState<Contract | undefined | null>(
    undefined
  )

  useEffect(() => {
    if (contractId) {
      getContract(db, contractId).then((result) => {
        setContract(result)
      })
    }
  }, [contractId])

  return contract
}

export function useLiveAllNewContracts(limit: number) {
  const generation = useRef(0)
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    const request = ++generation.current
    api('search-markets-full', { sort: 'newest', limit })
      .then((result) => {
        if (request === generation.current) setContracts(result)
      })
      .catch(console.error)
    return () => {
      generation.current++
    }
  }, [limit])

  useApiSubscription({
    topics: ['global/new-contract'],
    recoveryKey: String(limit),
    getSnapshot: async (signal) => {
      const request = ++generation.current
      const result = await api(
        'search-markets-full',
        { sort: 'newest', limit },
        { cache: 'no-store', signal }
      )
      return () => {
        if (request !== generation.current) return false
        setContracts(result)
      }
    },
    onBroadcast: ({ data }) => {
      generation.current++
      setContracts((old) => uniqBy([data.contract as Contract, ...old], 'id'))
    },
  })

  return contracts
}

export function useLiveContract<C extends Contract = Contract>(initial: C): C {
  return useLiveContractWithStatus(initial).contract
}

export function useLiveContractWithStatus<C extends Contract = Contract>(
  initial: C
) {
  const isPageVisible = useIsPageVisible()
  // ian: Batching is helpful on pages like /browse
  const [contract, setContract, hasLoaded] = useBatchedGetter<C>(
    queryHandlers,
    'markets',
    initial.id,
    initial,
    isPageVisible
  )

  useContractUpdates(initial, setContract)
  return { contract: contract ?? initial, hasLoaded }
}
