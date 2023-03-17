import { AnyContractType, Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import {
  getContractFromSlug,
  getContractParams,
} from 'web/lib/supabase/contracts'
import { ContractParams } from 'web/pages/[username]/[contractSlug]'

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
    contract: null,
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
