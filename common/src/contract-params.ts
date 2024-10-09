import {
  getInitialAnswerProbability,
  getInitialProbability,
} from 'common/calculate'
import {
  CPMMMultiContract,
  Contract,
  CPMMNumericContract,
  ContractParams,
} from 'common/contract'
import { binAvg, maxMinBin, serializeMultiPoints } from 'common/chart'

import { removeUndefinedProps } from 'common/util/object'
import { pointsToBase64 } from 'common/util/og'
import { buildArray } from 'common/util/array'
import { groupBy, mapValues, minBy, omit, orderBy, sortBy } from 'lodash'
import { Bet } from 'common/bet'
import { unauthedApi } from './util/api'
import { MAX_ANSWERS, sortAnswers } from './answer'
import { getBetPoints, getTotalBetCount } from 'web/lib/supabase/bets'
import { FullMarket } from './api/market-types'
import { APIResponse } from './api/schema'

export async function getContractParams(
  market: FullMarket,
  adminKey: string
): Promise<Omit<ContractParams, 'cash'>> {
  const isCpmm1 = market.mechanism === 'cpmm-1'
  const hasMechanism = market.mechanism !== 'none'
  const isMulti = market.mechanism === 'cpmm-multi-1'
  const isNumber = market.outcomeType === 'NUMBER'
  const numberContractBetCount = async () =>
    unauthedApi('unique-bet-group-count', {
      contractId: contract.id,
    }).then((res) => res.count)

  const [
    apiParams,
    totalBets,
    lastBetArray,
    allBetPoints,
    relatedContracts,
    betReplies,
  ] = await Promise.all([
    unauthedApi('get-market-props', {
      id: market.id,
      key: adminKey,
    }),
    hasMechanism
      ? isNumber
        ? numberContractBetCount()
        : getTotalBetCount(market.id)
      : 0,
    hasMechanism
      ? unauthedApi('bets', {
          contractId: market.id,
          limit: 1,
          order: 'desc',
          filterRedemptions: true,
        })
      : ([] as Bet[]),
    hasMechanism
      ? getBetPoints(market.id, {
          filterRedemptions: market.mechanism !== 'cpmm-multi-1',
        })
      : [],
    unauthedApi('get-related-markets', {
      contractId: market.id,
      limit: 10,
    }),
    // TODO: Should only send bets that are replies to comments we're sending, and load the rest client side
    isCpmm1
      ? unauthedApi('bets', {
          contractId: market.id,
          commentRepliesOnly: true,
        })
      : ([] as Bet[]),
  ])
  const {
    contract,
    chartAnnotations,
    topics,
    comments,
    pinnedComments,
    userPositionsByOutcome,
    topContractMetrics,
    totalPositions,
    dashboards,
  } = apiParams as APIResponse<'get-market-props'>
  const multiPoints =
    contract.mechanism === 'cpmm-multi-1'
      ? contract.outcomeType === 'NUMBER'
        ? getFilledInMultiNumericBetPoints(
            groupBy(allBetPoints, 'answerId'),
            contract
          )
        : getMultiBetPoints(allBetPoints, contract)
      : {}
  const multiPointsString = mapValues(multiPoints, (v) => pointsToBase64(v))

  const ogPoints = !isMulti ? binAvg(allBetPoints) : []
  const pointsString = pointsToBase64(ogPoints.map((p) => [p.x, p.y] as const))

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
    betReplies,
    pointsString,
    multiPointsString,
    comments,
    userPositionsByOutcome,
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
    ),
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
  contract: CPMMMultiContract
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
export const getFilledInMultiNumericBetPoints = (
  pointsByAnswerId: { [answerId: string]: { x: number; y: number }[] },
  contract: CPMMNumericContract
) => {
  const { answers } = contract

  const subsetOfAnswers = sortBy(
    answers,
    (a) => (a.resolution ? 1 : 0),
    (a) => -a.totalLiquidity
  ).slice(0, MAX_ANSWERS)

  const allUniqueCreatedTimes = new Set(
    Object.values(pointsByAnswerId).flatMap((a) => a.map((p) => p.x))
  )
  const pointsByAns = {} as { [answerId: string]: { x: number; y: number }[] }
  subsetOfAnswers.forEach((ans) => {
    const startY = getInitialAnswerProbability(contract, ans)

    const rawPoints = pointsByAnswerId[ans.id] ?? []
    const uniqueAnswerCreatedTimes = new Set(rawPoints.map((a) => a.x))
    // Bc we sometimes don't create low prob bets, we need to fill in the gaps
    const missingTimes = Array.from(allUniqueCreatedTimes).filter(
      (time) => !uniqueAnswerCreatedTimes.has(time)
    )
    const missingPoints = missingTimes.map((time) => ({
      x: time,
      y: minBy(rawPoints, (p) => Math.abs(p.x - time))?.y ?? 0,
      answerId: ans.id,
    }))
    const points = orderBy([...rawPoints, ...missingPoints], (p) => p.x)
    pointsByAns[ans.id] = buildArray<{ x: number; y: number }>(
      startY != undefined && { x: ans.createdTime, y: startY },
      points
    )
  })

  return serializeMultiPoints(pointsByAns)
}
