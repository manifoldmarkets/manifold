import { run, selectJson } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { ContractMetrics } from 'common/calculate-metrics'
import { Dictionary, flatMap, orderBy } from 'lodash'
import { getContracts } from 'web/lib/supabase/contracts'
import { Contract, CPMMBinaryContract } from 'common/contract'

export async function getUserContractMetrics(userId: string) {
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
  count = 1000
) {
  const { data } = await db.rpc('get_contract_metrics_with_contracts', {
    count,
    uid: userId,
  })
  const metricsByContract = {} as Dictionary<ContractMetrics>
  const contracts = [] as Contract[]
  flatMap(data).forEach((d) => {
    metricsByContract[d.contract_id] = d.metrics as ContractMetrics
    contracts.push(d.contract as Contract)
  })
  return { metricsByContract, contracts }
}

export async function getUserContractMetricsByProfit(
  userId: string,
  limit = 20
) {
  const { data: negative } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .order('data->from->day->profit' as any, {
        ascending: true,
      })
      .limit(limit)
  )
  const { data: profit } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('user_id', userId)
      .order('data->from->day->profit' as any, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit)
  )
  const cms = [...profit, ...negative].map((d) => d.data) as ContractMetrics[]
  const contracts = (await getContracts(
    cms.map((cm) => cm.contractId)
  )) as CPMMBinaryContract[]
  return {
    metrics: cms,
    contracts,
  }
}

export async function getTopContractUserMetrics(
  contractId: string,
  limit: number
) {
  const { data } = await run(
    selectJson(db, 'user_contract_metrics')
      .eq('contract_id', contractId)
      .gt('data->>profit', 0)
      .order('data->>profit' as any, {
        ascending: false,
      })
      .limit(limit)
  )
  return data.map((d) => d.data)
}

export async function getTotalContractMetrics(contractId: string) {
  const { count } = await run(
    db
      .from('user_contract_metrics')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
  )
  return count
}
