import { AnyContractType, Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import {
  getContractFromSlug,
  getContractIds,
  getContractParams,
  getContracts,
} from 'web/lib/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { ContractParams } from 'web/pages/[username]/[contractSlug]'
import { useEffectCheckEquality } from './use-effect-check-equality'

export const useContracts = (contractIds: string[]) => {
  const [contracts, setContracts] = useState<Contract[]>([])

  useEffectCheckEquality(() => {
    if (contractIds) {
      getContractIds(contractIds).then((result) => {
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
      getContractFromSlug(contractSlug).then((result) => {
        setContract(result)
      })
    }
  }, [contractSlug])

  return contract as Contract<AnyContractType>
}

export const useContractParams = (contract: Contract) => {
  const [contractParams, setContractParams] = useState<ContractParams>({
    contract: contract,
    historyData: {
      bets: [],
      points: [],
    },
    comments: [],
    userPositionsByOutcome: {},
    totalPositions: 0,
    totalBets: 0,
    topContractMetrics: [],
    relatedContracts: [],
  })

  useEffect(() => {
    getContractParams(contract).then((result) => setContractParams(result))
  }, [contract.id])

  return contractParams
}

export function useRealtimeContracts(limit: number) {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [newContract, setNewContract] = useState<Contract | undefined>(
    undefined
  )

  useEffect(() => {
    getContracts({ limit, order: 'desc' })
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
          setNewContract(payloadContract)
        }
      }
    )
    channel.subscribe(async (status) => {})
  }, [db])

  useEffect(() => {
    // if new bet exists, and is not already in bets, pushes it to front
    if (newContract && !contracts.some((c) => c.id == newContract.id)) {
      setContracts([newContract].concat(contracts.slice(0, -1)))
    }
  }, [newContract, contracts])
  return contracts
}
