import { SupabaseClient, convertSQLtoTS } from 'common/supabase/utils'
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'
import { Row, Schema, millisToTs, run, selectJson, tsToMillis } from './utils'
import { Bet, BetFilter } from 'common/bet'
import { chunk, sortBy } from 'lodash'
import { buildArray } from 'common/util/array'

export const CONTRACT_BET_FILTER: BetFilter = {
  filterRedemptions: true,
  filterChallenges: false,
  filterAntes: false,
}

export const convertBet = (row: Row<'contract_bets'>) =>
  convertSQLtoTS<'contract_bets', Bet>(row, {
    fs_updated_time: false,
    created_time: tsToMillis as any,
    answer_id: (a) => (a != null ? a : undefined),
  })

export async function getBet(db: SupabaseClient, id: string) {
  const q = selectJson(db, 'contract_bets').eq('bet_id', id).single()
  const { data } = await run(q)
  return data.data
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

export async function getBetsOnContracts(
  db: SupabaseClient,
  contractIds: string[],
  options?: Omit<BetFilter, 'contractId'>
) {
  const chunks = chunk(contractIds, 100)
  const rows = await Promise.all(
    chunks.map(async (ids: string[]) => {
      let q = db.from('contract_bets').select().in('contract_id', ids)
      q = applyBetsFilter(q, options)
      const { data } = await run(q)
      return data
    })
  )
  return rows.flat().map(convertBet)
}

export const getPublicBets = async (
  db: SupabaseClient,
  options?: BetFilter
) => {
  let q = selectJson(db, 'public_contract_bets')
  q = q.order('created_time', { ascending: options?.order === 'asc' })
  q = applyBetsFilter(q, options)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

export const getBets = async (db: SupabaseClient, options?: BetFilter) => {
  let q = selectJson(db, 'contract_bets')
  q = q.order('created_time', { ascending: options?.order === 'asc' })
  q = applyBetsFilter(q, options)
  const { data } = await run(q)
  return data.map((r) => r.data)
}

// gets random bets - 50,000 by default
export const getBetPoints = async <S extends SupabaseClient>(
  db: S,
  contractId: string,
  options?: BetFilter
) => {
  let q = db
    .from('contract_bets')
    .select('created_time, prob_before, prob_after, data->answerId')
    .order('bet_id') // get "random" points so it doesn't bunch up at the end
  q = applyBetsFilter(q, {
    contractId,
    limit: 50000,
    ...options,
  })
  const { data } = await run(q)

  const sorted = sortBy(data, 'created_time')

  if (sorted.length === 0) return []

  // we need to include previous prob for binary in case the prob shifted from something
  const includePrevProb = !!options?.afterTime && !sorted[0].answerId

  return buildArray(
    includePrevProb && {
      x: tsToMillis(sorted[0].created_time) - 1,
      y: sorted[0].prob_before as number,
      answerId: sorted[0].answerId as string,
    },
    sorted.map((r: any) => ({
      x: tsToMillis(r.created_time),
      y: r.prob_after as number,
      answerId: r.answerId as string,
    }))
  )
}

export const applyBetsFilter = <
  T extends PostgrestFilterBuilder<Schema, Row<'contract_bets'>, any>
>(
  q: T,
  options?: BetFilter
): T => {
  if (options?.contractId) {
    q = q.eq('contract_id', options.contractId)
  }
  if (options?.userId) {
    q = q.eq('user_id', options.userId)
  }
  if (options?.afterTime) {
    q = q.gt('created_time', millisToTs(options.afterTime))
  }
  if (options?.beforeTime) {
    q = q.lt('created_time', millisToTs(options.beforeTime))
  }
  if (options?.filterChallenges) {
    q = q.eq('is_challenge', false)
  }
  if (options?.filterAntes) {
    q = q.eq('is_ante', false)
  }
  if (options?.filterRedemptions) {
    q = q.eq('is_redemption', false)
  }
  if (options?.isOpenLimitOrder) {
    q = q.contains('data', { isFilled: false, isCancelled: false })
  }
  if (options?.limit) {
    q = q.limit(options.limit)
  }
  if (options?.commentRepliesOnly) {
    q = q.neq('data->>replyToCommentId', null)
  }
  if (options?.answerId) {
    q = q.eq('answer_id', options.answerId)
  }
  return q
}
