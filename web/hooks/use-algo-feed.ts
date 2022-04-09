import _ from 'lodash'
import { useState, useEffect, useMemo } from 'react'
import { Bet } from '../../common/bet'
import { Comment } from '../../common/comment'
import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { logInterpolation } from '../../common/util/math'
import { getRecommendedContracts } from '../../common/recommended-contracts'
import { useSeenContracts } from './use-seen-contracts'
import { useGetUserBetContractIds, useUserBetContracts } from './use-user-bets'

const MAX_FEED_CONTRACTS = 75

export const useAlgoFeed = (
  user: User | null | undefined,
  contracts: Contract[] | undefined,
  recentBets: Bet[] | undefined,
  recentComments: Comment[] | undefined
) => {
  const initialContracts = useMemo(() => contracts, [!!contracts])
  const initialBets = useMemo(() => recentBets, [!!recentBets])
  const initialComments = useMemo(() => recentComments, [!!recentComments])

  const yourBetContractIds = useGetUserBetContractIds(user?.id)
  // Update user bet contracts in local storage.
  useUserBetContracts(user?.id)

  const seenContracts = useSeenContracts()

  const [algoFeed, setAlgoFeed] = useState<Contract[]>([])

  useEffect(() => {
    if (initialContracts && initialBets && initialComments) {
      const eligibleContracts = initialContracts.filter(
        (c) => !c.isResolved && (c.closeTime ?? Infinity) > Date.now()
      )
      const contracts = getAlgoFeed(
        eligibleContracts,
        initialBets,
        initialComments,
        yourBetContractIds,
        seenContracts
      )
      setAlgoFeed(contracts)
    }
  }, [
    initialBets,
    initialComments,
    initialContracts,
    seenContracts,
    yourBetContractIds,
  ])

  return algoFeed
}

const getAlgoFeed = (
  contracts: Contract[],
  recentBets: Bet[],
  recentComments: Comment[],
  yourBetContractIds: string[],
  seenContracts: { [contractId: string]: number }
) => {
  const contractsById = _.keyBy(contracts, (c) => c.id)

  const recommended = getRecommendedContracts(contractsById, yourBetContractIds)
  const confidence = logInterpolation(0, 100, yourBetContractIds.length + 1)
  const recommendedScores = _.fromPairs(
    recommended.map((c, index) => {
      const score = 1 - index / recommended.length
      const withConfidence = score * confidence + (1 - confidence)
      return [c.id, withConfidence] as [string, number]
    })
  )

  const seenScores = _.fromPairs(
    contracts.map(
      (c) => [c.id, getSeenContractsScore(c, seenContracts)] as [string, number]
    )
  )

  const activityScores = getContractsActivityScores(
    contracts,
    recentComments,
    recentBets,
    seenContracts
  )

  const combinedScores = contracts.map((contract) => {
    const score =
      (recommendedScores[contract.id] ?? 0) *
      (seenScores[contract.id] ?? 0) *
      (activityScores[contract.id] ?? 0)
    return { contract, score }
  })

  const sorted = _.sortBy(combinedScores, (c) => -c.score)
  return sorted.map((c) => c.contract).slice(0, MAX_FEED_CONTRACTS)
}

function getContractsActivityScores(
  contracts: Contract[],
  recentComments: Comment[],
  recentBets: Bet[],
  seenContracts: { [contractId: string]: number }
) {
  const contractBets = _.groupBy(recentBets, (bet) => bet.contractId)
  const contractMostRecentBet = _.mapValues(
    contractBets,
    (bets) => _.maxBy(bets, (bet) => bet.createdTime) as Bet
  )

  const contractComments = _.groupBy(
    recentComments,
    (comment) => comment.contractId
  )
  const contractMostRecentComment = _.mapValues(
    contractComments,
    (comments) => _.maxBy(comments, (c) => c.createdTime) as Comment
  )

  const scoredContracts = contracts.map((contract) => {
    const seenTime = seenContracts[contract.id]
    const lastCommentTime = contractMostRecentComment[contract.id]?.createdTime
    const hasNewComments =
      !seenTime || (lastCommentTime && lastCommentTime > seenTime)
    const newCommentScore = hasNewComments ? 1 : 0.75

    const commentCount = contractComments[contract.id]?.length ?? 0
    const betCount = contractBets[contract.id]?.length ?? 0
    const activtyCount = betCount + commentCount * 5
    const activityCountScore = logInterpolation(0, 200, activtyCount)

    const lastBetTime = contractMostRecentBet[contract.id]?.createdTime
    const timeSinceLastBet = !lastBetTime
      ? contract.createdTime
      : Date.now() - lastBetTime
    const daysAgo = timeSinceLastBet / oneDayMs
    const timeAgoScore = 1 - logInterpolation(0, 3, daysAgo)

    const score = newCommentScore * activityCountScore * timeAgoScore

    // Map score to [0.5, 1] since no recent activty is not a deal breaker.
    const mappedScore = 0.5 + score / 2
    return [contract.id, mappedScore] as [string, number]
  })

  return _.fromPairs(scoredContracts)
}

const oneDayMs = 24 * 60 * 60 * 1000

function getSeenContractsScore(
  contract: Contract,
  seenContracts: { [contractId: string]: number }
) {
  const lastSeen = seenContracts[contract.id]
  if (lastSeen === undefined) {
    return 1
  }

  const daysAgo = (Date.now() - lastSeen) / oneDayMs

  if (daysAgo < 0.5) {
    const frac = logInterpolation(0, 0.5, daysAgo)
    return 0.5 * frac
  }

  const frac = logInterpolation(0.5, 14, daysAgo)
  return 0.5 + 0.5 * frac
}
