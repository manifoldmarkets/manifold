import { AnyContractType, Contract } from 'common/contract'
import { useEffect, useRef, useState } from 'react'
import {
  getContractFromSlug,
  getContracts,
  getPublicContractIds,
  getPublicContracts,
} from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { ContractParameters } from 'web/pages/[username]/[contractSlug]'
import { getContractParams } from 'web/lib/firebase/api'
import { useIsAuthorized } from './use-user'
import {
  useRealtimeRows,
} from 'web/lib/supabase/realtime/use-realtime'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'

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

export const useContractParams = (contractSlug: string | undefined) => {
  const [contractParams, setContractParams] = useState<any | undefined>(
    undefined
  )

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

  return contractParams as ContractParameters
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

  return contract as Contract<AnyContractType>
}

export const useContracts = (contractIds: string[]) => {
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffectCheckEquality(() => {
    if (contractIds) {
      getContracts(contractIds).then((result) => {
        setContracts(result)
      })
    }
  }, [contractIds])

  return contracts
}

export function useRealtimeContracts(limit: number) {
  const [oldContracts, setOldContracts] = useState<Contract[]>([])
  const newContracts = useRealtimeRows('contracts').map(
    (r) => r.data as Contract
  )

  useEffect(() => {
    getPublicContracts({ limit, order: 'desc' })
      .then((result) => setOldContracts(result))
      .catch((e) => console.log(e))
  }, [])

  return [...oldContracts, ...newContracts].slice(-limit)
}
