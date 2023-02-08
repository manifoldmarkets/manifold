import { run, selectJson, SupabaseClient } from 'common/supabase/utils'
import { ContractMetrics } from 'common/calculate-metrics'
import { Dictionary, flatMap, orderBy } from 'lodash'
import { getContracts } from 'common/supabase/contracts'
import { Contract, CPMMBinaryContract } from 'common/contract'

export async function getUserContractMetrics(
  userId: string,
  db: SupabaseClient
) {
  const { data } = await run(
    selectJson(db, 'user_contract_metrics').eq('user_id', userId)
  )
  return orderBy(
    data.map((r) => r.data),
    (cm) => cm.lastBetTime ?? 0,
    'desc'
  )
}

export async function getUserContractMetricsWithContracts(
  userId: string,
  db: SupabaseClient,
  count = 1000,
  start = 0
) {
  const { data } = await db.rpc('get_contract_metrics_with_contracts', {
    count,
    uid: userId,
    start,
  })
  const metricsByContract = {} as Dictionary<ContractMetrics>
  const contracts = [] as Contract[]
  flatMap(data).forEach((d) => {
    metricsByContract[d.contract_id] = d.metrics as ContractMetrics
    contracts.push(d.contract as Contract)
  })
  return { metricsByContract, contracts }
}

// To optimize this we should join on the contracts table
export async function getUserContractMetricsByProfitWithContracts(
  userId: string,
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all',
  limit = 20
) {
  const cms = await getBestAndWorstUserContractMetrics(userId, db, from, limit)
  const contracts = (await getContracts(
    cms.map((cm) => cm.contractId),
    db
  )) as CPMMBinaryContract[]
  return {
    metrics: cms,
    contracts,
  }
}

export async function getBestAndWorstUserContractMetrics(
  userId: string,
  db: SupabaseClient,
  from: 'day' | 'week' | 'month' | 'all',
  limit: number
) {
  const orderString =
    from !== 'all' ? `data->from->${from}->profit` : 'data->profit'
  const { data: negative } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .order(orderString as any, {
        ascending: true,
      })
      .limit(limit)
  )
  const { data: profit } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .order(orderString as any, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit)
  )
  return [...profit, ...negative].map((d) => d.data) as ContractMetrics[]
}

export async function getTotalContractMetrics(
  contractId: string,
  db: SupabaseClient
) {
  const { count } = await run(
    db
      .from('user_contract_metrics')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
  )
  return count
}
