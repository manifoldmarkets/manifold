import { SupabaseClient } from '@supabase/supabase-js'
import { Contract } from 'common/contract'
import { getInitialProbability } from 'common/calculate'
import { getBetPoints, getBets } from './bets'
import { binAvg, maxMinBin } from 'common/chart'
import { BetFilter, calculateMultiBets } from 'common/bet'
import { pointsToBase64 } from 'common/util/og'

export async function getChartPoints(
  contract: Contract,
  db: SupabaseClient,
  options?: BetFilter
) {
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const isSingle = contract.mechanism === 'cpmm-1'

  const allBetPoints =
    contract.mechanism == 'none'
      ? []
      : await getBetPoints(db, {
          contractId: contract.id,
          filterRedemptions: !isMulti,
          order: 'asc',
          ...options,
        })

  let chartPoints = isSingle
    ? [
        { x: contract.createdTime, y: getInitialProbability(contract) },
        ...maxMinBin(allBetPoints, 500),
      ].map((p) => [p.x, p.y] as const)
    : isMulti
    ? calculateMultiBets(
        allBetPoints,
        contract.answers.map((a) => a.id)
      )
    : []

  return {
    allBetPoints,
    chartPoints,
  }
}
