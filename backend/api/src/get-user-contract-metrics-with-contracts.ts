import { calculateUpdatedMetricsForContracts } from 'common/calculate-metrics'
import { MarketContract } from 'common/contract'
import { ContractMetric, isSummary } from 'common/contract-metric'
import { convertContract } from 'common/supabase/contracts'
import { Dictionary, mapValues, pick } from 'lodash'
import { getContractPrivacyWhereSQLFilter } from 'shared/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { prefixedContractColumnsToSelect } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'

export const getUserContractMetricsWithContracts: APIHandler<
  'get-user-contract-metrics-with-contracts'
> = async (props, auth) => {
  const { userId, limit, offset = 0, perAnswer = false, order } = props
  const visibilitySQL = getContractPrivacyWhereSQLFilter(auth?.uid, 'c.id')
  const pg = createSupabaseDirectClient()
  const metricFilterSQL = `(c.mechanism <> 'cpmm-multi-1' OR ucm.answer_id is not null)`
  const rankedOrderBySQL =
    order === 'profit'
      ? `total_profit DESC`
      : `last_bet_time DESC NULLS LAST`
  const finalOrderBySQL =
    order === 'profit'
      ? `rc.total_profit DESC`
      : `rc.last_bet_time DESC NULLS LAST`
  const q = `
        WITH ranked_contracts AS (
          SELECT
            c.id as contract_id,
            sum(ucm.profit) as total_profit,
            max((ucm.data->>'lastBetTime')::bigint) as last_bet_time
          FROM contracts c
          JOIN user_contract_metrics ucm ON c.id = ucm.contract_id
          WHERE ${visibilitySQL}
            AND ucm.user_id = $1
            AND ${metricFilterSQL}
          GROUP BY c.id
          ORDER BY ${rankedOrderBySQL}
          OFFSET $2 LIMIT $3
        )
        SELECT
          (select row_to_json(t) from (select ${prefixedContractColumnsToSelect}) t) as contract,
          jsonb_agg(ucm.data) as metrics
        FROM ranked_contracts rc
        JOIN contracts c ON c.id = rc.contract_id
        JOIN user_contract_metrics ucm ON ucm.contract_id = rc.contract_id
        WHERE ucm.user_id = $1
          AND ${metricFilterSQL}
        GROUP BY c.id, rc.total_profit, rc.last_bet_time
        ORDER BY ${finalOrderBySQL}
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

  const contracts = results.map((r) =>
    pick(r.contract, [
      'id',
      'question',
      'creatorName',
      'creatorUsername',
      'creatorId',
      'slug',
      'resolutionTime',
      'closeTime',
      'token',
      'mechanism',
      'outcomeType',
      'isResolved',
      'resolution',
      'resolutions',
      'answers',
      'volume24Hours',
      'totalLiquidity',
      'probChanges',
      'prob',
      'pool',
      'p',
      'min',
      'max',
      'isLogScale',
      'unit',
    ])
  )

  return {
    metricsByContract,
    // NOTE: this only returns the currently used contract props to save on bandwidth
    contracts: contracts as MarketContract[],
  }
}
