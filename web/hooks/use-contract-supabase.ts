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
  getPublicContractIds,
  getPublicContractRows,
} from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useIsAuthorized } from './use-user'
import { useContractFirebase } from './use-contract-firebase'

export const usePublicContracts = (contractIds: string[] | undefined) => {
  const [contracts, setContracts] = useState<Contract[] | undefined>()

  useEffectCheckEquality(() => {
    if (contractIds) {
      getPublicContractIds(contractIds).then((result) => {
        setContracts(result)
      })
    }
  }, [contractIds])

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
      getContractParams({ contractSlug, fromStaticProps: false }).then(
        (result) => {
          if (thisParamsRef === paramsRef.current) {
            setContractParams(result)
          }
        }
      )
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

export function useRealtimeContracts(limit: number) {
  const { rows } = useSubscription('contracts', undefined, () =>
    getPublicContractRows({ limit, order: 'desc' })
  )
  return (rows ?? []).map((r) => r.data as Contract)
}

export function useFirebasePublicAndRealtimePrivateContract(
  visibility: Visibility,
  contractId: string
) {
  const contract =
    visibility != 'private'
      ? useContractFirebase(contractId)
      : useRealtimeContract(contractId)

  return contract
}
