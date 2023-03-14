import { getInitialProbability } from 'common/calculate'
import { AnyContractType, Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getTotalContractMetrics } from 'common/supabase/contract-metrics'
import { compressPoints, pointsToBase64 } from 'common/util/og'
import { useEffect, useState } from 'react'
import { useBetCount, useBets } from 'web/hooks/use-bets-supabase'
import { useComments } from 'web/hooks/use-comments-supabase'
import { useContractFromSlug } from 'web/hooks/use-contract-supabase'
import { useCanAccessContract } from 'web/hooks/use-contracts'
import { getInitialRelatedMarkets } from 'web/hooks/use-related-contracts'
import { useUserById } from 'web/hooks/use-user-supabase'
import {
  getBinaryContractUserContractMetrics,
  getTopContractMetrics,
} from 'web/lib/firebase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { ContractPageContent } from 'web/pages/[username]/[contractSlug]'
import {
  InaccessiblePrivateThing,
  LoadingPrivateThing,
} from '../groups/private-group'
import {
  getBetPoints,
  getHistoryDataBets,
  getPointsString,
  getUseBetLimit,
  shouldUseBetPoints,
} from './contract-page-helpers'
import { removeUndefinedProps } from 'common/util/object'

export function PrivateContractPage(props: { contractSlug: string }) {
  const { contractSlug } = props
  const canAccess = useCanAccessContract(contractSlug, 1000)

  if (canAccess === undefined) {
    return <LoadingPrivateThing />
  } else if (canAccess === false)
    return <InaccessiblePrivateThing thing="market" />
  else {
    return (
      <ContractPageContent contractParams={getContractParams(contractSlug)} />
    )
  }
}

// export function AccessGantedPrivateContractPage(props: {
//   contractSlug: string
// }) {
//   const { contractSlug } = props
//   const canAccess = useCanAccessContract(contractSlug, 1000)

// }

export function getContractParams(contractSlug: string) {
  const contract = useContractFromSlug(contractSlug)
  const contractId = contract?.id
  const useBetPoints = shouldUseBetPoints(contract)
  const totalBets = contractId ? useBetCount(contractId) : 0
  const bets = contractId
    ? useBets(contractId, getUseBetLimit(useBetPoints))
    : []
  const includeAvatar = totalBets < 1000
  const betPoints = useBetPoints ? getBetPoints(bets, includeAvatar) : []
  const comments = contractId ? useComments(contractId, 100) : []
  const userPositionsByOutcome =
    contractId && contract?.outcomeType === 'BINARY'
      ? getBinaryContractUserContractMetrics(contractId, 100)
      : {}
  const topContractMetrics = contract?.resolution
    ? useTopContractMetrics(contract.id, 10)
    : []
  const totalPositions =
    contractId && contract?.outcomeType === 'BINARY'
      ? useTotalPositions(contractId)
      : 0

  if (useBetPoints && contract) {
    const firstPoint = {
      x: contract.createdTime,
      y: getInitialProbability(contract),
    }
    betPoints.push(firstPoint)
    betPoints.reverse()
  }

  const pointsString = getPointsString(betPoints)

  const creator = contract && useUserById(contract.creatorId)

  const relatedContracts = contract ? useRelatedContracts(contract) : []

  return removeUndefinedProps({
    contract,
    historyData: {
      bets: getHistoryDataBets(useBetPoints, bets),
      points: betPoints,
    },
    pointsString,
    comments,
    userPositionsByOutcome,
    totalPositions,
    totalBets,
    topContractMetrics,
    creatorTwitter: creator?.twitterHandle,
    relatedContracts,
  })
}

export function useBinaryContractUserContractMetrics(
  contractId: string,
  limit: number
) {
  const [userPositionsByOutcome, setUserPositionsByOutcome] = useState<{}>({})

  useEffect(() => {
    if (contractId) {
      getBinaryContractUserContractMetrics(contractId, limit).then((result) =>
        setUserPositionsByOutcome(result)
      )
    }
  }, [contractId])

  return userPositionsByOutcome
}

export function useTopContractMetrics(contractId: string, limit: number) {
  const [topContractMetrics, setTopContractMetrics] = useState<
    ContractMetric[]
  >([])

  useEffect(() => {
    if (contractId) {
      getTopContractMetrics(contractId, limit).then((result) =>
        setTopContractMetrics(result)
      )
    }
  }, [contractId])

  return topContractMetrics
}

export function useTotalPositions(contractId: string) {
  const [totalPositions, setTotalPositions] = useState<number>(0)

  useEffect(() => {
    if (contractId) {
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
