import { useFirestoreQueryData } from '@react-query-firebase/firestore'
import { useEffect, useState } from 'react'
import {
  Contract,
  listenForContracts,
  listenForHotContracts,
  listenForInactiveContracts,
  getUserBetContracts,
  getUserBetContractsQuery,
  listAllContracts,
  listenForContract,
} from 'web/lib/firebase/contracts'
import { QueryClient, useQuery, useQueryClient } from 'react-query'
import { MINUTE_MS, sleep } from 'common/util/time'
import {
  dailyScoreIndex,
  newIndex,
  trendingIndex,
} from 'web/lib/service/algolia'
import { CPMMBinaryContract } from 'common/contract'
import { Dictionary, isEqual, zipObject } from 'lodash'
import { useForceUpdate } from './use-force-update'
import { useEffectCheckEquality } from './use-effect-check-equality'

export const useAllContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForContracts(setContracts)
  }, [])

  return contracts
}

export const useTrendingContracts = (maxContracts: number) => {
  const { data } = useQuery(['trending-contracts', maxContracts], () =>
    trendingIndex.search<CPMMBinaryContract>('', {
      facetFilters: ['isResolved:false', 'visibility:public'],
      hitsPerPage: maxContracts,
    })
  )
  if (!data) return undefined
  return data.hits
}

export const useNewContracts = (maxContracts: number) => {
  const { data } = useQuery(['newest-contracts', maxContracts], () =>
    newIndex.search<CPMMBinaryContract>('', {
      facetFilters: ['isResolved:false', 'visibility:public'],
      hitsPerPage: maxContracts,
    })
  )
  if (!data) return undefined
  return data.hits
}

export const useContractsByDailyScoreNotBetOn = (
  userId: string | null | undefined,
  maxContracts: number
) => {
  const { data } = useQuery(['daily-score', userId, maxContracts], () =>
    dailyScoreIndex.search<CPMMBinaryContract>('', {
      facetFilters: [
        'isResolved:false',
        'visibility:public',
        `uniqueBettors:-${userId}`,
      ],
      hitsPerPage: maxContracts,
    })
  )
  if (!userId || !data) return undefined
  return data.hits.filter((c) => c.dailyScore)
}

export const useContractsByDailyScoreGroups = (
  groupSlugs: string[] | undefined
) => {
  const { data } = useQuery(['daily-score', groupSlugs], () =>
    Promise.all(
      (groupSlugs ?? []).map((slug) =>
        dailyScoreIndex.search<CPMMBinaryContract>('', {
          facetFilters: ['isResolved:false', `groupLinks.slug:${slug}`],
        })
      )
    )
  )
  if (!groupSlugs || !data || data.length !== groupSlugs.length)
    return undefined

  return zipObject(
    groupSlugs,
    data.map((d) => d.hits.filter((c) => c.dailyScore))
  )
}

const q = new QueryClient()
export const getCachedContracts = async () =>
  q.fetchQuery(['contracts'], () => listAllContracts(10000), {
    staleTime: Infinity,
  })

export const useInactiveContracts = () => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffect(() => {
    return listenForInactiveContracts(setContracts)
  }, [])

  return contracts
}

export const useHotContracts = () => {
  const [hotContracts, setHotContracts] = useState<Contract[] | undefined>()

  useEffect(() => listenForHotContracts(setHotContracts), [])

  return hotContracts
}

export const usePrefetchUserBetContracts = (userId: string) => {
  const queryClient = useQueryClient()
  return queryClient.prefetchQuery(
    ['contracts', 'bets', userId],
    () => sleep(1000).then(() => getUserBetContracts(userId)),
    { staleTime: 5 * MINUTE_MS }
  )
}

export const useUserBetContracts = (userId: string) => {
  const result = useFirestoreQueryData(
    ['contracts', 'bets', userId],
    getUserBetContractsQuery(userId)
  )
  return result.data
}

const contractsStore: Dictionary<Contract | null> = {}
const contractListeners: Dictionary<((contract: Contract | null) => void)[]> =
  {}

const updateContract = (contractId: string, contract: Contract | null) => {
  if (isEqual(contractsStore[contractId], contract)) return

  contractsStore[contractId] = contract
  contractListeners[contractId]?.forEach((l) => l(contract))
}

export const useContracts = (contractIds: string[]) => {
  const forceUpdate = useForceUpdate()

  useEffectCheckEquality(() => {
    for (const id of contractIds) {
      if (!contractListeners[id]) {
        contractListeners[id] = []
        listenForContract(id, (c) => updateContract(id, c))
      }
    }

    const listeners = contractIds.map(
      (id) =>
        [
          id,
          () => {
            // Update after all have loaded, and on every subsequent update.
            if (contractIds.every((id) => contractsStore[id] !== undefined)) {
              forceUpdate()
            }
          },
        ] as const
    )
    for (const [id, listener] of listeners) {
      contractListeners[id].push(listener)
    }
    return () => {
      for (const [id, listener] of listeners) {
        contractListeners[id] = contractListeners[id].filter(
          (l) => l !== listener
        )
      }
    }
  }, [contractIds, forceUpdate])

  return contractIds.map(
    (id) => contractsStore[id] as Contract | null | undefined
  )
}

export const useContract = (contractId: string | undefined) => {
  const [contract] = useContracts(contractId ? [contractId] : [])
  return contract
}
