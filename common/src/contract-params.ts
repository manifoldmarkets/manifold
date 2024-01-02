import {
  getInitialAnswerProbability,
  getInitialProbability,
} from 'common/calculate'
import {
  CPMMMultiContract,
  Contract,
  MaybeAuthedContractParams,
} from 'common/contract'
import { binAvg, maxMinBin, serializeMultiPoints } from 'common/chart'
import { getBets, getBetPoints, getTotalBetCount } from 'common/supabase/bets'
import { getRecentTopLevelCommentsAndReplies } from 'common/supabase/comments'
import {
  getCPMMContractUserContractMetrics,
  getTopContractMetrics,
  getContractMetricsCount,
} from 'common/supabase/contract-metrics'
import { getTopics, getUserIsMember } from 'common/supabase/groups'
import { removeUndefinedProps } from 'common/util/object'
import { getIsAdmin } from 'common/supabase/is-admin'
import { pointsToBase64 } from 'common/util/og'
import { SupabaseClient } from 'common/supabase/utils'
import { buildArray } from 'common/util/array'
import { groupBy, orderBy } from 'lodash'
import { Bet } from 'common/bet'
import { getChartAnnotations } from 'common/supabase/chart-annotations'

export async function getContractParams(
  contract: Contract,
  db: SupabaseClient,
  checkAccess?: boolean,
  userId?: string | undefined
): Promise<MaybeAuthedContractParams> {
  const isCpmm1 = contract.mechanism === 'cpmm-1'
  const hasMechanism = contract.mechanism !== 'none'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const isBinaryDpm =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'dpm-2'

  const [
    canAccessContract,
    totalBets,
    betsToPass,
    allBetPoints,
    comments,
    userPositionsByOutcome,
    topContractMetrics,
    totalPositions,
    relatedContracts,
    betReplies,
    chartAnnotations,
    topics,
  ] = await Promise.all([
    checkAccess ? getCanAccessContract(contract, userId, db) : true,
    hasMechanism ? getTotalBetCount(contract.id, db) : 0,
    hasMechanism
      ? getBets(db, {
          contractId: contract.id,
          limit: 100,
          order: 'desc',
          filterAntes: true,
          filterRedemptions: true,
        })
      : ([] as Bet[]),
    hasMechanism
      ? getBetPoints(db, contract.id, {
          filterRedemptions: contract.mechanism !== 'cpmm-multi-1',
        })
      : [],
    getRecentTopLevelCommentsAndReplies(db, contract.id, 25),
    isCpmm1
      ? getCPMMContractUserContractMetrics(contract.id, 100, null, db)
      : {},
    contract.resolution ? getTopContractMetrics(contract.id, 10, db) : [],
    isCpmm1 || isMulti ? getContractMetricsCount(contract.id, db) : 0,
    unauthedApi('get-related-markets', {
      contractId: contract.id,
      limit: 4,
    }),
    // getRelatedContracts(contract, 20, db),
    // TODO: Should only send bets that are replies to comments we're sending, and load the rest client side
    isCpmm1
      ? getBets(db, {
          contractId: contract.id,
          commentRepliesOnly: true,
        })
      : ([] as Bet[]),
    getChartAnnotations(contract.id, db),
    getTopics(contract.groupLinks?.map((gl) => gl.groupId) ?? [], db),
  ])
  if (!canAccessContract) {
    return contract && !contract.deleted
      ? {
          state: 'not authed',
          slug: contract.slug,
          visibility: contract.visibility,
        }
      : { state: 'not found' }
  }

  const chartPoints =
    isCpmm1 || isBinaryDpm
      ? getSingleBetPoints(allBetPoints, contract)
      : isMulti
      ? getMultiBetPoints(allBetPoints, contract)
      : []

  const ogPoints =
    isCpmm1 && contract.visibility !== 'private' ? binAvg(allBetPoints) : []
  const pointsString = pointsToBase64(ogPoints.map((p) => [p.x, p.y] as const))

  return {
    state: 'authed',
    params: removeUndefinedProps({
      outcomeType: contract.outcomeType,
      contract,
      historyData: {
        bets: betsToPass.concat(
          betReplies.filter(
            (b1) => !betsToPass.map((b2) => b2.id).includes(b1.id)
          )
        ),
        points: chartPoints,
      },
      pointsString,
      comments,
      userPositionsByOutcome,
      totalPositions,
      totalBets,
      topContractMetrics,
      relatedContracts: relatedContracts.marketsFromEmbeddings as Contract[],
      relatedContractsByTopicSlug: relatedContracts.marketsByTopicSlug,
      chartAnnotations,
      topics: orderBy(
        topics,
        (t) => t.importanceScore + (t.privacyStatus === 'public' ? 1 : 0),
        'desc'
      ),
    }),
  }
}

export const getSingleBetPoints = (
  betPoints: { x: number; y: number }[],
  contract: Contract
) => {
  betPoints.sort((a, b) => a.x - b.x)
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
  betPoints: { x: number; y: number; answerId: string }[],
  contract: CPMMMultiContract
) => {
  const { answers } = contract

  const rawPointsByAns = groupBy(betPoints, 'answerId')

  const pointsByAns = {} as { [answerId: string]: { x: number; y: number }[] }
  answers.forEach((ans) => {
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

const getCanAccessContract = async (
  contract: Contract,
  uid: string | undefined,
  db: SupabaseClient
): Promise<boolean> => {
  const groupId = contract.groupLinks?.length
    ? contract.groupLinks[0].groupId
    : undefined
  const isAdmin = uid ? await getIsAdmin(db, uid) : false

  return (
    (!contract.deleted || isAdmin) &&
    (contract.visibility !== 'private' ||
      (groupId !== undefined &&
        uid !== undefined &&
        (isAdmin || (await getUserIsMember(db, groupId, uid)))))
  )
}
