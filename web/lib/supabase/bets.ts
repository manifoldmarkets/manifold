import { db } from './db'
import { run } from 'common/supabase/utils'

export async function getOlderBets(
  contractId: string,
  beforeTime: number,
  limit: number
) {
  const { data } = await run(
    db
      .from('bets')
      .select('data')
      .like('data->>contractId', contractId)
      // .eq(`data->>contractId`, contractId)
      // .eq('data->>contractId', contractId)
      // .lte('data->>createdTime', beforeTime)
      // .order('data->createdTime', { ascending: false } as any)
      .limit(limit)
  )

  return data
}
