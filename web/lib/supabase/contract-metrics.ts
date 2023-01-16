import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { ContractMetrics } from 'common/calculate-metrics'
import { JsonData } from 'common/supabase/json-data'
import { orderBy } from 'lodash'
import { getContracts } from 'web/lib/supabase/contracts'
import { CPMMBinaryContract } from 'common/contract'

export async function getUserContractMetrics(userId: string) {
  const { data } = await run(
    db.from('user_contract_metrics').select('data').eq('user_id', userId)
  )
  return orderBy(
    data.map((d: JsonData<ContractMetrics>) => d.data),
    (cm) => cm.lastBetTime ?? 0,
    'desc'
  )
}

export async function getUserContractMetricsByProfit(
  userId: string,
  limit = 20
) {
  const { data: negative } = await run(
    db
      .from('user_contract_metrics')
      .select('data')
      .eq('user_id', userId)
      .order('data->from->day->profit' as any, {
        ascending: true,
      })
      .limit(limit)
  )
  const { data: profit } = await run(
    db
      .from('user_contract_metrics')
      .select('data')
      .eq('user_id', userId)
      .order('data->from->day->profit' as any, {
        ascending: false,
        nullsFirst: false,
      })
      .limit(limit)
  )
  const cms = [...profit, ...negative].map(
    (d: JsonData<ContractMetrics>) => d.data
  ) as ContractMetrics[]
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
    db
      .from('user_contract_metrics')
      .select('data')
      .eq('contract_id', contractId)
      .gt('data->>profit', 0)
      .order('data->>profit' as any, {
        ascending: false,
      })
      .limit(limit)
  )
  return data.map((d: JsonData<ContractMetrics>) => d.data)
}
