import { getInitialProbability } from 'common/calculate'
import {
  AnyContractType,
  BinaryContract,
  Contract,
  PseudoNumericContract,
} from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getTotalContractMetrics } from 'common/supabase/contract-metrics'
import { removeUndefinedProps } from 'common/util/object'
import { useEffect, useState } from 'react'
import { useBetCount, useBets } from 'web/hooks/use-bets-supabase'
import { useComments } from 'web/hooks/use-comments-supabase'
import { usePrivateContract } from 'web/hooks/use-contracts'
import { getInitialRelatedMarkets } from 'web/hooks/use-related-contracts'
import { useUserById } from 'web/hooks/use-user-supabase'
import {
  getBinaryContractUserContractMetrics,
  getTopContractMetrics,
} from 'web/lib/firebase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import {
  ContractPageContent,
  ContractParams,
} from 'web/pages/[username]/[contractSlug]'
import {
  InaccessiblePrivateThing,
  LoadingPrivateThing,
} from '../groups/private-group'
import {
  getBetPoints,
  getHistoryDataBets,
  getUseBetLimit,
  shouldUseBetPoints,
} from './contract-page-helpers'

export function PrivateContractPage(props: { contractSlug: string }) {
  const { contractSlug } = props
  const contract = usePrivateContract(contractSlug, 1000)

  if (contract === undefined) {
    return <LoadingPrivateThing />
  } else if (contract === null)
    return <InaccessiblePrivateThing thing="market" />
  else {
    return <ContractParamsPageContent contract={contract} />
  }
}

export function ContractParamsPageContent(props: {
  contract: Contract<AnyContractType>
}) {
  const { contract } = props
  const contractParams = useContractParams(contract)
  return <ContractPageContent contractParams={contractParams} />
}

export function useContractParams(contract: Contract) {
  const contractId = contract.id
  const useBetPoints = shouldUseBetPoints(contract)
  const totalBets = useBetCount(contractId)
  const bets = useBets(contractId, getUseBetLimit(useBetPoints))
  const includeAvatar = totalBets < 1000
  const betPoints = useBetPoints ? getBetPoints(bets, includeAvatar) : []
  const comments = useComments(contractId, 100)
  const userPositionsByOutcome =
    contractId && contract?.outcomeType === 'BINARY'
      ? getBinaryContractUserContractMetrics(contractId, 100)
      : {}
  const topContractMetrics = useTopContractMetrics(
    contractId,
    10,
    contract.resolution
  )
  const totalPositions = useTotalPositions(
    contractId,
    contract.outcomeType === 'BINARY'
  )

  if (useBetPoints && contract) {
    const firstPoint = {
      x: contract.createdTime,
      y: getInitialProbability(
        contract as BinaryContract | PseudoNumericContract
      ),
    }
    betPoints.push(firstPoint)
    betPoints.reverse()
  }
  const creator = useUserById(contract.creatorId)

  const relatedContracts = useRelatedContracts(contract)

  return removeUndefinedProps({
    contract,
    historyData: {
      bets: getHistoryDataBets(useBetPoints, bets),
      points: betPoints,
    },
    comments,
    userPositionsByOutcome,
    totalPositions,
    totalBets,
    topContractMetrics,
    creatorTwitter: creator?.twitterHandle,
    relatedContracts,
  }) as ContractParams
}

export function useBinaryContractUserContractMetrics(
  contractId: string,
  limit: number
) {
  const [userPositionsByOutcome, setUserPositionsByOutcome] = useState<{
    YES: ContractMetric[]
    NO: ContractMetric[]
  }>({ YES: [], NO: [] })

  useEffect(() => {
    if (contractId) {
      getBinaryContractUserContractMetrics(contractId, limit).then((result) =>
        setUserPositionsByOutcome(result)
      )
    }
  }, [contractId])

  return userPositionsByOutcome
}

export function useTopContractMetrics(
  contractId: string,
  limit: number,
  contractResolution?: string
) {
  const [topContractMetrics, setTopContractMetrics] = useState<
    ContractMetric[]
  >([])

  useEffect(() => {
    if (contractId && contractResolution) {
      getTopContractMetrics(contractId, limit).then((result) =>
        setTopContractMetrics(result)
      )
    }
  }, [contractId])

  return topContractMetrics
}

export function useTotalPositions(contractId: string, shouldUse: boolean) {
  const [totalPositions, setTotalPositions] = useState<number>(0)

  useEffect(() => {
    if (contractId && shouldUse) {
      getTotalContractMetrics(contractId, db).then((result) =>
        setTotalPositions(result)
      )
    }
  }, [contractId])

  return totalPositions
}

export function useRelatedContracts(contract: Contract) {
  const [relatedContracts, setRelatedContracts] = useState<
    Contract<AnyContractType>[]
  >([])

  useEffect(() => {
    if (contract) {
      getInitialRelatedMarkets(contract).then((result) =>
        setRelatedContracts(result)
      )
    }
  }, [contract])
  return relatedContracts
}
