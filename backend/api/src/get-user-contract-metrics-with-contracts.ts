import { APIHandler } from './helpers/endpoint'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { Dictionary, mapValues } from 'lodash'
import { convertContract } from 'common/supabase/contracts'
import { contractColumnsToSelect } from 'shared/utils'

export const getUserContractMetricsWithContracts: APIHandler<
  'get-user-contract-metrics-with-contracts'
> = async (props, auth) => {
  const { userId, limit, offset = 0, perAnswer = false, inMani } = props
  const visibilitySQL = getContractPrivacyWhereSQLFilter(
    auth?.uid,
    undefined,
    'c.id'
  )
  const pg = createSupabaseDirectClient()
  const columnsWithAlias = contractColumnsToSelect
    .split(', ')
    .map((col) => `c.${col}`)
    .join(', ')
  const q = `
        SELECT 
          (select row_to_json(t) from (select c.${contractColumnsToSelect}) t) as contract,
          jsonb_agg(ucm.data) as metrics
        FROM contracts c
        JOIN user_contract_metrics ucm ON c.id = ucm.contract_id
        WHERE ${visibilitySQL}
          AND ucm.user_id = $1
          and case when c.mechanism = 'cpmm-multi-1' then ucm.answer_id is not null else true end
          ${
            inMani
              ? "and c.data->>'siblingContractId' is not null and ucm.has_shares = true"
              : ''
          }
        GROUP BY c.id, ${columnsWithAlias}
        ORDER BY max((ucm.data->>'lastBetTime')::bigint) DESC NULLS LAST
        OFFSET $2 LIMIT $3
      `
  const results = await pg.map(q, [userId, offset, limit], (row) => ({
    contract: convertContract(row.contract),
    metrics: row.metrics as ContractMetric[],
  }))

  const { metricsByContract: allMetrics } =
    calculateUpdatedMetricsForContracts(results)
  const metricsByContract = mapValues(allMetrics, (metrics) =>
    perAnswer ? metrics : metrics.filter((m) => m.answerId === null)
  ) as Dictionary<ContractMetric[]>

  return {
    metricsByContract,
    contracts: results.map((r) => r.contract),
  }
}
