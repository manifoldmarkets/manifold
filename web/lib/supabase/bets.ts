import { db } from './db'
import { run } from 'common/supabase/utils'
import { Bet } from 'common/bet'
import { JsonData } from 'web/lib/supabase/json-data'

export async function getOlderBets(
  contractId: string,
  beforeTime: number,
  limit: number
) {
  const { data } = await run(
    db
      .from('contract_bets')
      .select('data')
      .contains('data', { contractId })
      .lt('data->>createdTime', beforeTime)
      .order('data->>createdTime', { ascending: false } as any)
      .limit(limit)
  )

  return data.map((d: JsonData<Bet>) => d.data)
}
