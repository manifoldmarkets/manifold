import {
  getInitialAnswerProbability,
  getInitialProbability,
} from 'common/calculate'
import { Contract, ContractParams, MultiContract } from 'common/contract'
import { binAvg, maxMinBin, serializeMultiPoints } from 'common/chart'
import {
  getPinnedComments,
  getRecentTopLevelCommentsAndReplies,
} from 'common/supabase/comments'
import {
  getContractMetricsCount,
  getTopContractMetrics,
} from 'common/supabase/contract-metrics'
import { getTopicsOnContract } from 'common/supabase/groups'
import { removeUndefinedProps } from 'common/util/object'
import { pointsToBase64, pointsToBase64Float32 } from 'common/util/og'
import { SupabaseClient } from 'common/supabase/utils'
import { buildArray } from 'common/util/array'
import { groupBy, mapValues, omit, orderBy, sortBy } from 'lodash'
import { Bet } from 'common/bet'
import { getChartAnnotations } from 'common/supabase/chart-annotations'
import { unauthedApi } from './util/api'
import {
  ANSWERS_TO_HIDE_GRAPH,
  getDefaultSort,
  getSortedAnswers,
  MAX_ANSWERS,
  sortAnswers,
} from './answer'
import { getDashboardsToDisplayOnContract } from './supabase/dashboards'
import { getBetPointsBetween, getTotalBetCount } from './bets'

export async function getContractParams(
  contract: Contract,
  db: SupabaseClient
): Promise<Omit<ContractParams, 'cash'>> {
  const isCpmm1 = contract.mechanism === 'cpmm-1'
  const hasMechanism = contract.mechanism !== 'none'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const isNumber = contract.outcomeType === 'NUMBER'
  const numberContractBetCount = async () =>
    unauthedApi('unique-bet-group-count', {
      contractId: contract.id,
    }).then((res) => res.count)
  const includeRedemptions =
    contract.mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne
  const [
    totalBets,
    lastBetArray,
    allBetPoints,
    comments,
    pinnedComments,
    topContractMetrics,
    totalPositions,
    relatedContracts,
    chartAnnotations,
    topics,
    dashboards,
  ] = await Promise.all([
    hasMechanism
      ? isNumber
        ? numberContractBetCount()
        : getTotalBetCount(contract.id)
      : 0,
    hasMechanism
      ? unauthedApi('bets', {
          contractId: contract.id,
          limit: 1,
          order: 'desc',
          filterRedemptions: true,
        })
      : ([] as Bet[]),
    hasMechanism && !shouldHideGraph(contract)
      ? getBetPointsBetween({
          contractId: contract.id,
          filterRedemptions: !includeRedemptions,
          includeZeroShareRedemptions: includeRedemptions,
          beforeTime: (contract.lastBetTime ?? contract.createdTime) + 1,
          afterTime: contract.createdTime,
        })
      : [],
    getRecentTopLevelCommentsAndReplies(db, contract.id, 25),
    getPinnedComments(db, contract.id),
    contract.resolution ? getTopContractMetrics(contract.id, 10, db) : [],
    isCpmm1 || isMulti ? getContractMetricsCount(contract.id, db) : 0,
    unauthedApi('get-related-markets', {
      contractId: contract.id,
      limit: 10,
    }),
    getChartAnnotations(contract.id, db),
    getTopicsOnContract(contract.id, db),
    getDashboardsToDisplayOnContract(contract.slug, contract.creatorId, db),
  ])

  // TODO: getMultiBetPoints breaks NUMBER market time series charts and I think MULTI_NUMERIC as well when they get enough bets
  // TODO: remove multiPointsString for markets with more than x answers as it's not displayed by default anyways
  const multiPoints = isMulti ? getMultiBetPoints(allBetPoints, contract) : {}
  const multiPointsString = mapValues(multiPoints, (v) => pointsToBase64(v))

  const ogPoints = !isMulti ? binAvg(allBetPoints) : []
  // Non-numeric markets don't need as much precision
  const pointsString = pointsToBase64Float32(
    ogPoints.map((p) => [p.x, p.y] as const)
  )

  if (
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1'
  ) {
    contract.answers = sortAnswers(contract, contract.answers)
      .slice(0, 20)
      .map((a) => omit(a, ['textFts', 'fsUpdatedTime']) as any)
  }

  const lastBet: Bet | undefined = lastBetArray[0]
  const lastBetTime = lastBet?.createdTime

  return removeUndefinedProps({
    outcomeType: contract.outcomeType,
    contract,
    lastBetTime,
    pointsString,
    multiPointsString,
    comments,
    totalPositions,
    totalBets,
    topContractMetrics,
    relatedContracts: relatedContracts.marketsFromEmbeddings as Contract[],
    chartAnnotations,
    pinnedComments,
    topics: orderBy(
      topics,
      (t) => t.importanceScore + (t.privacyStatus === 'public' ? 1 : 0),
      'desc'
    ).map(removeUndefinedProps),
    dashboards,
  })
}

export const getSingleBetPoints = (
  betPoints: { x: number; y: number }[],
  contract: Contract
) => {
  const points = buildArray<{ x: number; y: number }>(
    contract.mechanism === 'cpmm-1' && {
      x: contract.createdTime,
      y: getInitialProbability(contract),
    },
    maxMinBin(betPoints, 500)
  )
  return points.map((p) => [p.x, p.y] as const)
}

export const getMultiBetPoints = (
  betPoints: { x: number; y: number; answerId: string | undefined }[],
  contract: MultiContract
) => {
  const { answers } = contract

  const rawPointsByAns = groupBy(betPoints, 'answerId')

  const subsetOfAnswers = sortBy(
    answers,
    (a) => (a.resolution ? 1 : 0),
    (a) => -a.totalLiquidity
  ).slice(0, MAX_ANSWERS)

  const pointsByAns = {} as { [answerId: string]: { x: number; y: number }[] }
  subsetOfAnswers.forEach((ans) => {
    const startY = getInitialAnswerProbability(contract, ans)

    const points = rawPointsByAns[ans.id] ?? []
    points.sort((a, b) => a.x - b.x)

    pointsByAns[ans.id] = buildArray<{ x: number; y: number }>(
      startY != undefined && { x: ans.createdTime, y: startY },
      maxMinBin(points, 500)
    )
  })

  return serializeMultiPoints(pointsByAns)
}

export const getAnswerProbAtEveryBetTime = (
  pointsByAnswerId: { [answerId: string]: { x: number; y: number }[] },
  contract: MultiContract
) => {
  const { answers, createdTime } = contract
  const allUniqueProbChangeTimes = new Set<number>([
    ...Object.values(pointsByAnswerId).flatMap((a) => a.map((p) => p.x)),
    createdTime,
  ])

  const sortedTimestamps = Array.from(allUniqueProbChangeTimes).sort(
    (a, b) => a - b
  )

  const pointsByAns = {} as { [answerId: string]: { x: number; y: number }[] }
  answers.forEach((ans) => {
    const startingProb = getInitialAnswerProbability(contract, ans) ?? 0
    const rawPoints = [
      { x: createdTime, y: startingProb, answerId: ans.id },
      ...(pointsByAnswerId[ans.id] ?? []),
    ]

    const pointsByTime = new Map(rawPoints.map((p) => [p.x, p]))

    const normalizedPoints = sortedTimestamps.map((timestamp) => {
      // If we have a point at this exact timestamp, use it
      if (pointsByTime.has(timestamp)) {
        return {
          x: timestamp,
          y: pointsByTime.get(timestamp)!.y,
        }
      }

      // Otherwise find the closest previous point
      const prevPoints = rawPoints
        .filter((p) => p.x <= timestamp)
        .sort((a, b) => b.x - a.x)

      const closestPoint = prevPoints[0]

      return {
        x: timestamp,
        y: closestPoint ? closestPoint.y : startingProb,
      }
    })

    pointsByAns[ans.id] = normalizedPoints
  })

  return pointsByAns
}

export const shouldHideGraph = (contract: Contract) => {
  if (contract.mechanism !== 'cpmm-multi-1') return false
  if (
    contract.outcomeType == 'NUMBER' ||
    contract.outcomeType == 'MULTI_NUMERIC' ||
    contract.outcomeType == 'DATE'
  )
    return false
  const defaultSort = getDefaultSort(contract)
  const sortedAnswers = sortAnswers(contract, contract.answers, defaultSort)
  const initialAnswers = getSortedAnswers(contract, sortedAnswers, defaultSort)

  return initialAnswers.length > ANSWERS_TO_HIDE_GRAPH
}
