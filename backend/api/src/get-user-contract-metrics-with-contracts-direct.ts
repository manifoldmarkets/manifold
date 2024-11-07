import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { ContractMetric } from 'common/contract-metric'
import { MarketContract } from 'common/contract'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { DAY_MS } from 'common/util/time'

export const getDailyChangedMetricsAndContracts: APIHandler<
  'get-daily-changed-metrics-and-contracts'
> = async (props, auth) => {
  const { limit, offset = 0 } = props
  const userId = auth.uid

  const pg = createSupabaseDirectClient()

  // First update the user's metrics
  const statsByUser = await updateUserMetricPeriods(
    [userId],
    Date.now() - DAY_MS
  )
  const orderString = `ucm.data->'from'->'day'->'profit'`

  const query = `
    select ucm.contract_id,
      ucm.data as metrics,
      c.data as contract
    from user_contract_metrics as ucm
      join contracts as c on c.id = ucm.contract_id
    where ucm.user_id = $1
      and ucm.answer_id is null
    order by ${orderString} asc
    limit $2
    offset $3;

    select ucm.contract_id,
      ucm.data as metrics,
      c.data as contract
    from user_contract_metrics as ucm
      join contracts as c on c.id = ucm.contract_id
    where ucm.user_id = $1
      and ucm.answer_id is null
    order by ${orderString} desc nulls last
    limit $2 
    offset $3;`

  const results = await pg.multi(query, [userId, limit / 2, offset])
  const combinedResults = results.flat()
  const metrics = combinedResults.map((data) => data.metrics as ContractMetric)
  const contracts = combinedResults.map(
    (data) => data.contract as MarketContract
  )
  return {
    metrics,
    contracts,
    dailyProfit: statsByUser[userId].profit,
    investmentValue: statsByUser[userId].value,
  }
}
