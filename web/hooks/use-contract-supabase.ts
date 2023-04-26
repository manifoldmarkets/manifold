import { AnyContractType, Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import {
  getContractFromSlug,
  getPublicContractIds,
  getPublicContracts,
} from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { ContractParams } from 'web/pages/[username]/[contractSlug]'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { getContractParams } from 'web/lib/contracts'

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

export const useContractParams = (contract: Contract) => {
  const [contractParams, setContractParams] = useState<
    ContractParams | undefined
  >()

  useEffect(() => {
    getContractParams(contract).then(setContractParams)
  }, [contract.id])

  return contractParams
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
