import {
  Contract,
  MaybeAuthedContractParams,
  Visibility,
} from 'common/contract'
import { useEffect, useRef, useState } from 'react'
import { getContractParams } from 'web/lib/firebase/api'
import {
  getContract,
  getContractFromSlug,
  getContracts,
  getIsPrivateContractMember,
  getPublicContractIdsInTopics,
  getPublicContractsByIds,
  getRecentPublicContractRows,
  getTrendingContracts,
} from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useIsAuthorized } from './use-user'
import { useContractFirebase } from './use-contract-firebase'
import { difference, uniqBy } from 'lodash'

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
    if (topicSlugs || ignoreSlugs) {
      getPublicContractIdsInTopics(newIds, topicSlugs ?? [], ignoreSlugs).then(
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

export function useRealtimeContract(contractId: string) {
  const { rows } = useSubscription('contracts', {
    k: 'id',
    v: contractId ?? '_',
  })
  return rows != null && rows.length > 0
    ? (rows[0].data as Contract)
    : undefined
}

export function useIsPrivateContractMember(userId: string, contractId: string) {
  const [isPrivateContractMember, setIsPrivateContractMember] = useState<
    boolean | undefined | null
  >(undefined)
  useEffect(() => {
    getIsPrivateContractMember(userId, contractId).then((result) => {
      setIsPrivateContractMember(result)
    })
  }, [userId, contractId])
  return isPrivateContractMember
}

export const useContractParams = (contractSlug: string | undefined) => {
  const [contractParams, setContractParams] = useState<
    MaybeAuthedContractParams | undefined
  >()

  const isAuth = useIsAuthorized()
  const paramsRef = useRef(0)
  useEffect(() => {
    paramsRef.current += 1
    const thisParamsRef = paramsRef.current
    if (contractSlug && isAuth !== undefined) {
      setContractParams(undefined)
      getContractParams({ contractSlug }).then((result) => {
        if (thisParamsRef === paramsRef.current) {
          setContractParams(result)
        }
      })
    }
  }, [contractSlug, isAuth])

  return contractParams
}

export const useContractFromSlug = (contractSlug: string | undefined) => {
  const [contract, setContract] = useState<Contract | undefined>(undefined)

  useEffect(() => {
    if (contractSlug) {
      getContractFromSlug(contractSlug, db).then((result) => {
        setContract(result)
      })
    }
  }, [contractSlug])

  return contract as Contract
}

export const useContracts = (
  contractIds: string[],
  pk: 'id' | 'slug' = 'id'
) => {
  const [contracts, setContracts] = useState<Contract[]>([])

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

export function useRealtimeNewContracts(limit: number) {
  const [startTime] = useState<string>(new Date().toISOString())
  const { rows } = useSubscription(
    'contracts',
    undefined,
    () => getRecentPublicContractRows({ limit }),
    undefined,
    `created_time=gte.${startTime})}`
  )
  return (rows ?? []).map((r) => r.data as Contract)
}

export function useFirebasePublicContract(
  visibility: Visibility,
  contractId: string
) {
  const contract =
    visibility != 'private' ? useContractFirebase(contractId) : undefined // useRealtimeContract(contractId)

  return contract
}

export function useTrendingContracts(limit: number) {
  const [contracts, setContracts] = useState<Contract[] | undefined>(undefined)
  useEffect(() => {
    getTrendingContracts(limit).then(setContracts)
  }, [limit])
  return contracts
}
