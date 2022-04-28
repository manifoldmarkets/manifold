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
import { DAY_MS } from '../../common/util/time'
import {
  getProbability,
  getOutcomeProbability,
  getTopAnswer,
} from '../../common/calculate'
import { useTimeSinceFirstRender } from './use-time-since-first-render'
import { trackLatency } from '../lib/firebase/tracking'

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

  const getTime = useTimeSinceFirstRender()

  useEffect(() => {
    if (
      initialContracts &&
      initialBets &&
      initialComments &&
      yourBetContractIds
    ) {
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
      trackLatency('feed', getTime())
    }
  }, [
    initialBets,
    initialComments,
    initialContracts,
    seenContracts,
    yourBetContractIds,
    getTime,
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
  const confidence = logInterpolation(0, 100, yourBetContractIds.length)
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
    const { outcomeType } = contract

    const seenTime = seenContracts[contract.id]
    const lastCommentTime = contractMostRecentComment[contract.id]?.createdTime
    const hasNewComments =
      !seenTime || (lastCommentTime && lastCommentTime > seenTime)
    const newCommentScore = hasNewComments ? 1 : 0.5

    const commentCount = contractComments[contract.id]?.length ?? 0
    const betCount = contractBets[contract.id]?.length ?? 0
    const activtyCount = betCount + commentCount * 5
    const activityCountScore =
      0.5 + 0.5 * logInterpolation(0, 200, activtyCount)

    const { volume7Days, volume } = contract
    const combinedVolume = Math.log(volume7Days + 1) + Math.log(volume + 1)
    const volumeScore = 0.5 + 0.5 * logInterpolation(4, 25, combinedVolume)

    const lastBetTime =
      contractMostRecentBet[contract.id]?.createdTime ?? contract.createdTime
    const timeSinceLastBet = Date.now() - lastBetTime
    const daysAgo = timeSinceLastBet / DAY_MS
    const timeAgoScore = 1 - logInterpolation(0, 3, daysAgo)

    let prob = 0.5
    if (outcomeType === 'BINARY') {
      prob = getProbability(contract)
    } else if (outcomeType === 'FREE_RESPONSE') {
      const topAnswer = getTopAnswer(contract)
      if (topAnswer)
        prob = Math.max(0.5, getOutcomeProbability(contract, topAnswer.id))
    }
    const frac = 1 - Math.abs(prob - 0.5) ** 2 / 0.25
    const probScore = 0.5 + frac * 0.5

    const score =
      newCommentScore *
      activityCountScore *
      volumeScore *
      timeAgoScore *
      probScore

    // Map score to [0.5, 1] since no recent activty is not a deal breaker.
    const mappedScore = 0.5 + score / 2
    const newMappedScore = 0.75 + score / 4

    const isNew = Date.now() < contract.createdTime + DAY_MS
    const activityScore = isNew ? newMappedScore : mappedScore

    return [contract.id, activityScore] as [string, number]
  })

  return _.fromPairs(scoredContracts)
}

function getSeenContractsScore(
  contract: Contract,
  seenContracts: { [contractId: string]: number }
) {
  const lastSeen = seenContracts[contract.id]
  if (lastSeen === undefined) {
    return 1
  }

  const daysAgo = (Date.now() - lastSeen) / DAY_MS

  if (daysAgo < 0.5) {
    const frac = logInterpolation(0, 0.5, daysAgo)
    return 0.5 * frac
  }

  const frac = logInterpolation(0.5, 14, daysAgo)
  return 0.5 + 0.5 * frac
}
