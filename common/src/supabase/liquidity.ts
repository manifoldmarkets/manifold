import { SupabaseClient } from 'common/supabase/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { run, selectJson } from 'common/supabase/utils'

export type LiquidityFilter = {
  contractId: string
  filterAntes?: boolean
  filterHouse?: boolean
  beforeTime?: number
  limit?: number
  order?: 'desc' | 'asc'
}

export async function getLiquidityProvisions(
  db: SupabaseClient,
  options?: LiquidityFilter
) {
  let q = selectJson(db, 'contract_liquidity')
    .gt('data->amount', 0)
    .order('data->createdTime', { ascending: options?.order === 'asc' })

  if (options?.contractId) {
    q = q.eq('contract_id', options.contractId)
  }
  if (options?.filterHouse) {
    q = q
      .neq('data->>userId', HOUSE_LIQUIDITY_PROVIDER_ID)
      .neq('data->>userId', DEV_HOUSE_LIQUIDITY_PROVIDER_ID)
  }
  if (options?.filterAntes) {
    q = q.or('data->isAnte.eq.false,data->isAnte.is.null')
  }
  if (options?.beforeTime) {
    q = q.lt('data->createdTime', options.beforeTime)
  }
  if (options?.limit) {
    q = q.limit(options.limit)
  }
  const result = await run(q)
  return result.data.map((r) => r.data)
}
