import { type Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import {
  getContract,
  getContracts,
  getPublicContractIdsInTopics,
  getPublicContractsByIds,
  getRecentPublicContractRows,
} from 'web/lib/supabase/contracts'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { difference, uniqBy } from 'lodash'
import { useApiSubscription } from './use-api-subscription'
import { useAnswersCpmm } from './use-answers'
import { convertContract } from 'common/supabase/contracts'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useIsPageVisible } from './use-page-visible'

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
      getPublicContractsByIds(newIds).then((result) => {
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
      getContracts(contractIds, pk).then((result) => {
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
      getContract(contractId).then((result) => {
        setContract(result)
      })
    }
  }, [contractId])

  return contract
}

export function useLiveAllNewContracts(limit: number) {
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    getRecentPublicContractRows({ limit }).then((result) => {
      setContracts(result.map(convertContract))
    })
  }, [])

  useApiSubscription({
    topics: ['global/new-contract'],
    onBroadcast: ({ data }) => {
      setContracts((old) => [data.contract as Contract, ...old])
    },
  })

  return contracts
}

export function useLiveContract<C extends Contract = Contract>(initial: C) {
  const [contract, setContract] = usePersistentInMemoryState<C>(
    initial,
    `contract-${initial.id}`
  )

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (isPageVisible) {
      getContract(initial.id).then((result) => {
        if (result) setContract(result as C)
      })
    }
  }, [initial.id, isPageVisible])

  useApiSubscription({
    topics: [`contract/${initial.id}`],
    onBroadcast: ({ data }) => {
      setContract((contract) => ({ ...contract, ...(data.contract as C) }))
    },
  })

  return contract
}

export function useLiveContractWithAnswers<C extends Contract = Contract>(
  initial: C
) {
  const contract = useLiveContract(initial)

  if (contract.mechanism === 'cpmm-multi-1') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const answers = useAnswersCpmm(contract.id)
    if (answers) {
      contract.answers = answers
    }
  }

  return contract
}
