import { Contract, ContractParams } from 'common/contract'
import {
  getRecentTopLevelCommentsAndReplies,
  getPinnedComments,
} from 'common/supabase/comments'
import {
  getCPMMContractUserContractMetrics,
  getTopContractMetrics,
  getContractMetricsCount,
} from 'common/supabase/contract-metrics'
import { getRelatedPoliticsContracts } from 'common/supabase/related-contracts'
import { SupabaseClient } from 'common/supabase/utils'
import { Bet } from 'common/bet'
import { getChartAnnotations } from 'common/supabase/chart-annotations'
import { getBetPoints, getBets, getTotalBetCount } from 'common/supabase/bets'
import { getMultiBetPoints, getSingleBetPoints } from 'common/contract-params'
import { binAvg } from 'common/chart'
import { pointsToBase64 } from 'common/util/og'
import { unstable_cache } from 'next/cache'

export const getContractParams = async function (
  contract: Contract,
  db: SupabaseClient
): Promise<ContractParams> {
  const isCpmm1 = contract.mechanism === 'cpmm-1'
  const hasMechanism = contract.mechanism !== 'none'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const isBinaryDpm =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'dpm-2'

  // TODO: add unstable_cache where applicable
  const [
    totalBets,
    betsToPass,
    allBetPoints,
    comments,
    pinnedComments,
    userPositionsByOutcome,
    topContractMetrics,
    totalPositions,
    relatedContracts,
    betReplies,
    chartAnnotations,
  ] = await Promise.all([
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
    getPinnedComments(db, contract.id),
    isCpmm1
      ? getCPMMContractUserContractMetrics(contract.id, 100, null, db)
      : {},
    contract.resolution ? getTopContractMetrics(contract.id, 10, db) : [],
    isCpmm1 || isMulti ? getContractMetricsCount(contract.id, db) : 0,
    unstable_cache(
      async () => getRelatedPoliticsContracts(contract, 20, db),
      [contract.id],
      { revalidate: 5 * 60 }
    )(),
    // TODO: Should only send bets that are replies to comments we're sending, and load the rest client side
    isCpmm1
      ? getBets(db, {
          contractId: contract.id,
          commentRepliesOnly: true,
        })
      : ([] as Bet[]),
    getChartAnnotations(contract.id, db),
  ])

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
    pinnedComments,
    userPositionsByOutcome,
    totalPositions,
    totalBets,
    topContractMetrics,

    // Not sure if these will be used on politics, if so will need to implement
    relatedContractsByTopicSlug: {},
    topics: [],
    relatedContracts,
    chartAnnotations,
  } as ContractParams
}
