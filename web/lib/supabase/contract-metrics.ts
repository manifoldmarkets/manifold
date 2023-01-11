import { run } from 'common/lib/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { ContractMetrics } from 'common/calculate-metrics'
import { JsonData } from 'web/lib/supabase/json-data'
import { orderBy } from 'lodash'

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
