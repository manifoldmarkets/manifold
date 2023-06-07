import { SupabaseClient } from '@supabase/supabase-js'
import { millisToTs, run, selectJson } from './utils'
import { BetFilter } from 'common/bet'

export const CONTRACT_BET_FILTER: BetFilter = {
  filterRedemptions: true,
  filterChallenges: false,
  filterAntes: false,
}

export async function getTotalBetCount(contractId: string, db: SupabaseClient) {
  const { count } = await run(
    db
      .from('contract_bets')
      .select('*', { head: true, count: 'exact' })
      .eq('contract_id', contractId)
      .eq('is_challenge', false)
      .eq('is_redemption', false)
      .eq('is_ante', false)
  )
  return count as number
}

export const getBetRows = async (db: SupabaseClient, options?: BetFilter) => {
  let q = db.from('contract_bets').select('*')
  q = q.order('created_time', { ascending: options?.order === 'asc' })
  q = applyBetsFilter(q, options)
  const { data } = await run(q)
  return data
}

export const getBets = async (db: SupabaseClient, options?: BetFilter) => {
  let q = selectJson(db, 'contract_bets')
  q = q.order('created_time', { ascending: options?.order === 'asc' })
  q = applyBetsFilter(q, options)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

// mqp: good luck typing q
export const applyBetsFilter = <T>(q: T, options?: BetFilter): T => {
  if (options?.contractId) {
    q = (q as any).eq('contract_id', options.contractId)
  }
  if (options?.userId) {
    q = (q as any).eq('user_id', options.userId)
  }
  if (options?.afterTime) {
    q = (q as any).gt('created_time', millisToTs(options.afterTime))
  }
  if (options?.beforeTime) {
    q = (q as any).lt('created_time', millisToTs(options.beforeTime))
  }
  if (options?.filterChallenges) {
    q = (q as any).eq('is_challenge', false)
  }
  if (options?.filterAntes) {
    q = (q as any).eq('is_ante', false)
  }
  if (options?.filterRedemptions) {
    q = (q as any).eq('is_redemption', false)
  }
  if (options?.isOpenLimitOrder) {
    q = (q as any).contains('data', { isFilled: false, isCancelled: false })
  }
  if (options?.limit) {
    q = (q as any).limit(options.limit)
  }
  return q
}
