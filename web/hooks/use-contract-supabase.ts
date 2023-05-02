import { AnyContractType, Contract } from 'common/contract'
import { useEffect, useRef, useState } from 'react'
import {
  getContract,
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
import { RealtimeChannel } from '@supabase/realtime-js'

export function useRealtimeContract(contractId: string | undefined) {
  const [contract, setContract] = useState<Contract | undefined | null>(
    undefined
  )

  useEffect(() => {
    if (contractId) {
      getContract(contractId)
        .then((result) => setContract(result))
        .catch((e) => console.log(e))
    }
    console.log(contract)
  }, [])

  useEffect(() => {
    let channel: RealtimeChannel
    if (contractId && contract) {
      channel = db.channel(`realtime-contract-${contractId}`)
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contracts',
          filter: 'id=eq.' + contractId,
        },
        (payload) => {
          if (payload) {
            setContract(payload.new as Contract)
          }
        }
      )
      channel.subscribe(async (status) => {})
    }
    return () => {
      if (channel) {
        db.removeChannel(channel)
      }
    }
  }, [db])

  return contract
}

export const usePublicContracts = (contractIds: string[]) => {
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffectCheckEquality(() => {
    if (contractIds) {
      getPublicContractIds(contractIds).then((result) => {
        setContracts(result)
      })
    }
  }, [contractIds])

  return contracts
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

export function useRealtimeContracts(limit: number) {
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    getPublicContracts({ limit, order: 'desc' })
      .then((result) => setContracts(result))
      .catch((e) => console.log(e))
  }, [])

  useEffect(() => {
    const channel = db.channel('live-contracts')
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'contracts',
      },
      (payload) => {
        if (payload) {
          const payloadContract = payload.new.data as Contract
          setContracts((contracts) => {
            if (
              payloadContract &&
              !contracts.some((c) => c.id == payloadContract.id)
            ) {
              return [payloadContract].concat(contracts.slice(0, -1))
            } else {
              return contracts
            }
          })
        }
      }
    )
    channel.subscribe(async (status) => {})
    return () => {
      db.removeChannel(channel)
    }
  }, [db])

  return contracts
}
