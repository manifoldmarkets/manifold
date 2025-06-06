import { APIHandler } from './helpers/endpoint'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ContractMetric, isSummary } from 'common/contract-metric'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { Dictionary, mapValues } from 'lodash'
import { convertContract } from 'common/supabase/contracts'
import { prefixedContractColumnsToSelect } from 'shared/utils'
import { MarketContract } from 'common/contract'

export const getUserContractMetricsWithContracts: APIHandler<
  'get-user-contract-metrics-with-contracts'
> = async (props, auth) => {
  const { userId, limit, offset = 0, perAnswer = false, order } = props
  const visibilitySQL = getContractPrivacyWhereSQLFilter(auth?.uid, 'c.id')
  const pg = createSupabaseDirectClient()
  const orderBySQL =
    order === 'profit'
      ? `sum(ucm.profit) DESC`
      : `max((ucm.data->>'lastBetTime')::bigint) DESC NULLS LAST`
  const q = `
        SELECT 
          (select row_to_json(t) from (select ${prefixedContractColumnsToSelect}) t) as contract,
          jsonb_agg(ucm.data) as metrics
        FROM contracts c
        JOIN user_contract_metrics ucm ON c.id = ucm.contract_id
        WHERE ${visibilitySQL}
          AND ucm.user_id = $1
          and case when c.mechanism = 'cpmm-multi-1' then ucm.answer_id is not null else true end
        GROUP BY c.id, ${prefixedContractColumnsToSelect}
        ORDER BY ${orderBySQL}
        OFFSET $2 LIMIT $3
      `
  const results = await pg.map(q, [userId, offset, limit], (row) => ({
    contract: convertContract<MarketContract>(row.contract),
    metrics: row.metrics as ContractMetric[],
  }))

  const { metricsByContract: allMetrics } =
    calculateUpdatedMetricsForContracts(results)
  const metricsByContract = mapValues(allMetrics, (metrics) =>
    perAnswer ? metrics : metrics.filter((m) => isSummary(m))
  ) as Dictionary<ContractMetric[]>

  return {
    metricsByContract,
    contracts: results.map((r) => r.contract),
  }
}
