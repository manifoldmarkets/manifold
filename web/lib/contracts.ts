import {
  BinaryContract,
  Contract,
  PseudoNumericContract,
} from 'common/contract'
import { getBets, getTotalBetCount } from 'web/lib/supabase/bets'
import { CONTRACT_BET_FILTER } from 'web/pages/[username]/[contractSlug]'
import { removeUndefinedProps } from 'common/util/object'
import { HistoryPoint } from 'web/components/charts/generic-charts'
import { Bet } from 'common/bet'
import { getAllComments } from 'web/lib/supabase/comments'
import {
  getBinaryContractUserContractMetrics,
  getTopContractMetrics,
} from 'web/lib/firebase/contract-metrics'
import { getTotalContractMetrics } from 'common/supabase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { getInitialProbability } from 'common/calculate'
import { compressPoints, pointsToBase64 } from 'common/util/og'
import { getUser } from 'web/lib/supabase/user'
import { getRelatedContracts } from 'web/hooks/use-related-contracts'

export async function getContractParams(contract: Contract) {
  const contractId = contract.id
  const totalBets = await getTotalBetCount(contractId)
  const shouldUseBetPoints =
    contract.outcomeType === 'BINARY' ||
    contract.outcomeType === 'PSEUDO_NUMERIC'

  // in original code, prioritize newer bets via descending order
  const bets = await getBets({
    contractId,
    ...CONTRACT_BET_FILTER,
    limit: shouldUseBetPoints ? 50000 : 4000,
    order: 'desc',
  })

  const betPoints = shouldUseBetPoints
    ? bets.map(
        (bet) =>
          removeUndefinedProps({
            x: bet.createdTime,
            y: bet.probAfter,
            obj:
              totalBets < 1000
                ? { userAvatarUrl: bet.userAvatarUrl }
                : undefined,
          }) as HistoryPoint<Partial<Bet>>
      )
    : []

  const comments = await getAllComments(contractId, 100)

  const userPositionsByOutcome =
    contract.outcomeType === 'BINARY'
      ? await getBinaryContractUserContractMetrics(contractId, 100)
      : {}

  const topContractMetrics = contract.resolution
    ? await getTopContractMetrics(contract.id, 10)
    : []

  const totalPositions =
    contract.outcomeType === 'BINARY'
      ? await getTotalContractMetrics(contractId, db)
      : 0

  if (shouldUseBetPoints) {
    const firstPoint = {
      x: contract.createdTime,
      y: getInitialProbability(
        contract as BinaryContract | PseudoNumericContract
      ),
    }
    betPoints.push(firstPoint)
    betPoints.reverse()
  }

  const pointsString =
    contract.visibility != 'private'
      ? pointsToBase64(compressPoints(betPoints))
      : undefined

  const creator = await getUser(contract.creatorId)

  const relatedContracts = await getRelatedContracts(contract, 9)

  return removeUndefinedProps({
    contract,
    historyData: {
      bets: shouldUseBetPoints ? bets.slice(0, 100) : bets,
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
