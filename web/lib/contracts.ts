import { Bet } from 'common/bet'
import { getInitialProbability } from 'common/calculate'
import { HistoryPoint } from 'common/chart'
import {
  BinaryContract,
  Contract,
  PseudoNumericContract,
} from 'common/contract'
import {
  CONTRACT_BET_FILTER,
  getBets,
  getTotalBetCount,
} from 'common/supabase/bets'
import { getAllComments } from 'common/supabase/comments'
import {
  ShareholderStats,
  getTotalContractMetrics,
} from 'common/supabase/contract-metrics'
import { getRelatedContracts } from 'common/supabase/related-contracts'
import { removeUndefinedProps } from 'common/util/object'
import { compressPoints, pointsToBase64 } from 'common/util/og'
import {
  getCPMMContractUserContractMetrics,
  getContractMetricsNoCount,
  getContractMetricsYesCount,
  getTopContractMetrics,
} from 'web/lib/firebase/contract-metrics'
import { db } from 'web/lib/supabase/db'
import { getUser } from 'web/lib/supabase/user'

export async function getContractParamz(contract: Contract) {
  const contractId = contract.id
  const totalBets = await getTotalBetCount(contractId, db)
  const shouldUseBetPoints = contract.mechanism === 'cpmm-1'

  // in original code, prioritize newer bets via descending order
  const bets = await getBets(db, {
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

  const comments = await getAllComments(db, contractId, 100)

  const userPositionsByOutcome =
    contract.mechanism === 'cpmm-1'
      ? await getCPMMContractUserContractMetrics(contractId, 100)
      : {}

  const topContractMetrics = contract.resolution
    ? await getTopContractMetrics(contract.id, 10)
    : []

  let shareholderStats: ShareholderStats | undefined = undefined
  if (contract.mechanism === 'cpmm-1') {
    const [yesCount, noCount] = await Promise.all([
      getContractMetricsYesCount(contractId),
      getContractMetricsNoCount(contractId),
    ])
    shareholderStats = {
      yesShareholders: yesCount,
      noShareholders: noCount,
    }
  }

  const totalPositions =
    contract.mechanism === 'cpmm-1'
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

  const relatedContracts = await getRelatedContracts(contract, 9, db)

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
    shareholderStats,
  })
}
