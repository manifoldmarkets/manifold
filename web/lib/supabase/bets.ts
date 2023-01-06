import { db } from './db'
import { run } from 'common/supabase/utils'
import { Bet } from 'common/bet'
import { JsonData } from 'web/lib/supabase/json-data'

export async function getOlderBets(
  contractId: string,
  beforeTime: number,
  limit: number
) {
  const query = db
    .from('contract_bets')
    .select('data')
    .eq('contract_id', contractId)
    .lt('data->>createdTime', beforeTime)
    .order('data->>createdTime', { ascending: false } as any)
    .limit(limit)
  const { data } = await run(query)

  return data.map((d: JsonData<Bet>) => d.data)
}
