import { type Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import { getContract, getContracts } from 'common/supabase/contracts'
import { getPublicContractIdsInTopics } from 'web/lib/supabase/contracts'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { difference, uniqBy } from 'lodash'
import { useApiSubscription } from './use-api-subscription'
import { useIsPageVisible } from './use-page-visible'
import { api } from 'web/lib/api/api'
import { db } from 'web/lib/supabase/db'
import { useBatchedGetter } from './use-batched-getter'
import { Answer } from 'common/answer'

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
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    api('search-markets-full', { sort: 'newest', limit }).then((result) =>
      setContracts(result)
    )
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
  const isPageVisible = useIsPageVisible()
  // ian: Batching is helpful on pages like /browse
  const [contract, setContract] = useBatchedGetter<C>(
    'markets',
    initial.id,
    initial,
    isPageVisible
  )

  useApiSubscription({
    topics: [`contract/${initial.id}/new-answer`],
    enabled: initial.mechanism === 'cpmm-multi-1',
    onBroadcast: ({ data }) => {
      setContract((contract) => {
        return {
          ...contract,
          answers: [
            ...('answers' in contract ? contract.answers : []),
            data.answer as Answer,
          ],
        }
      })
    },
  })

  useApiSubscription({
    topics: [`contract/${initial.id}/updated-answers`],
    enabled: initial.mechanism === 'cpmm-multi-1',
    onBroadcast: ({ data }) => {
      const newAnswerUpdates = data.answers as (Partial<Answer> & {
        id: string
      })[]
      setContract((contract) => {
        return {
          ...contract,
          answers: ('answers' in contract ? contract.answers : []).map(
            (answer) => {
              const update = newAnswerUpdates.find(
                (newAnswer) => newAnswer.id === answer.id
              )
              if (!update) return answer
              return { ...answer, ...update }
            }
          ),
        }
      })
    },
  })

  useApiSubscription({
    topics: [`contract/${initial.id}`],
    onBroadcast: ({ data }) => {
      setContract((contract) => {
        return { ...contract, ...(data.contract as C) }
      })
    },
  })

  return contract ?? initial
}
