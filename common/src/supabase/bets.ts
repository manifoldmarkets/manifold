import { SupabaseClient, convertSQLtoTS } from 'common/supabase/utils'
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'
import { Row, Schema, millisToTs, run, tsToMillis } from './utils'
import { Bet } from 'common/bet'
import { sortBy } from 'lodash'
import { buildArray } from 'common/util/array'
import { APIParams } from 'common/api/schema'

export const convertBet = (row: Row<'contract_bets'>) =>
  convertSQLtoTS<'contract_bets', Bet>(row, {
    updated_time: false,
    created_time: tsToMillis as any,
    answer_id: (a) => (a != null ? a : undefined),
  })

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

// gets random bets - 50,000 by default
export const getBetPoints = async <S extends SupabaseClient>(
  db: S,
  contractId: string,
  options?: APIParams<'bets'>
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
  options?: APIParams<'bets'>
): T => {
  if (options?.contractId && typeof options.contractId === 'string') {
    q = q.eq('contract_id', options.contractId)
  }
  if (options?.contractId && Array.isArray(options.contractId)) {
    q = q.in('contract_id', options.contractId)
  }
  if (options?.userId) {
    q = q.eq('user_id', options.userId)
  }
  if (options?.afterTime) {
    q = q.gt('created_time', millisToTs(options.afterTime))
  }
  if (options?.beforeTime !== undefined) {
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
  if (options?.kinds === 'open-limit') {
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
