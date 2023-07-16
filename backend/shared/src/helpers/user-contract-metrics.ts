import { groupBy } from 'lodash'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpsert } from 'shared/supabase/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { Row } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'

export async function updateContractMetricsForUsers(
  contract: Contract,
  allContractBets: Bet[]
) {
  const betsByUser = groupBy(allContractBets, 'userId')
  const metrics: ContractMetric[] = []
  for (const userId in betsByUser) {
    const userBets = betsByUser[userId]
    metrics.push(calculateUserMetrics(contract, userBets))
  }

  await bulkUpdateContractMetrics(metrics)
}

export async function bulkUpdateContractMetrics(metrics: ContractMetric[]) {
  const pg = createSupabaseDirectClient()
  const updatedTime = new Date().toISOString()
  bulkUpsert(
    pg,
    'user_contract_metrics',
    ['user_id', 'contract_id'],
    metrics.map(
      (m) =>
        removeUndefinedProps({
          contract_id: m.contractId,
          user_id: m.userId,
          data: m,
          fs_updated_time: updatedTime,
          has_no_shares: m.hasNoShares,
          has_shares: m.hasShares,
          profit: m.profit,
          has_yes_shares: m.hasYesShares,
          total_shares_no: m.totalShares['NO'],
          total_shares_yes: m.totalShares['YES'],
        }) as Row<'user_contract_metrics'>
    )
  )
}
