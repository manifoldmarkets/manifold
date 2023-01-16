import { db } from './db'
import { run } from 'common/supabase/utils'
import { Bet } from 'common/bet'
import { JsonData } from 'common/supabase/json-data'
import { BetFilter } from 'web/lib/firebase/bets'

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

export const getBets = async (options?: BetFilter) => {
  const query = getBetsQuery(options)
  const { data } = (await run(query)) as { data: JsonData<Bet>[] }
  return data.map((d) => d.data)
}

export const getBetsQuery = (options?: BetFilter) => {
  let q = db
    .from('contract_bets')
    .select('data')
    .order('data->>createdTime', { ascending: options?.order === 'asc' } as any)

  if (options?.contractId) {
    q = q.eq('contract_id', options.contractId)
  }
  if (options?.userId) {
    q = q.eq('data->>userId', options.userId)
  }
  if (options?.afterTime) {
    q = q.gt('data->>createdTime', options.afterTime)
  }
  if (options?.filterChallenges) {
    q = q.contains('data', { isChallenge: false })
  }
  if (options?.filterAntes) {
    q = q.contains('data', { isAnte: false })
  }
  if (options?.filterRedemptions) {
    q = q.contains('data', { isRedemption: false })
  }
  if (options?.isOpenLimitOrder) {
    q = q.contains('data', { isFilled: false, isCancelled: false })
  }
  if (options?.limit) {
    q = q.limit(options.limit)
  }
  return q
}
