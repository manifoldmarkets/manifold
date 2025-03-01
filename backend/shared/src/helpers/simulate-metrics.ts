import { calculateAnswerMetricsWithNewBetsOnly } from 'common/calculate-metrics'
import { ContractMetric } from 'common/contract-metric'
import { convertBet } from 'common/supabase/bets'
import { groupBy } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const simulateMetrics = async (userId: string, contractId: string) => {
  const pg = createSupabaseDirectClient()
  const bets = await pg.map(
    `select * from contract_bets
     where user_id = $1 and contract_id = $2
    order by created_time asc`,
    [userId, contractId],
    convertBet
  )
  let contractMetrics: Omit<ContractMetric, 'id'>[] = []
  const betsByCreatedTime = groupBy(bets, 'createdTime')
  for (const [createdTime, bets] of Object.entries(betsByCreatedTime)) {
    console.log(createdTime)
    contractMetrics = calculateAnswerMetricsWithNewBetsOnly(
      bets,
      contractMetrics as ContractMetric[],
      bets[0].contractId,
      false
    )
    console.log(
      contractMetrics[0].totalShares['YES'],
      contractMetrics[0].totalShares['NO']
    )
    console.log(contractMetrics[0])
  }
}
