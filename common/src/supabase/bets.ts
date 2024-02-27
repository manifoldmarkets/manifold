import { SupabaseClient, convertSQLtoTS } from 'common/supabase/utils'
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'
import { Row, Schema, millisToTs, run, selectJson, tsToMillis } from './utils'
import { Bet, BetFilter } from 'common/bet'
import { User } from 'common/user'
import { getContractBetMetrics } from 'common/calculate'
import { Contract } from 'common/contract'
import { chunk, groupBy, maxBy, minBy } from 'lodash'
import { removeUndefinedProps } from 'common/util/object'

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

// gets 50,000 unsorted random bets
export const getBetPoints = async <S extends SupabaseClient>(
  db: S,
  contractId: string,
  options?: BetFilter
) => {
  let q = db
    .from('contract_bets')
    .select('created_time, prob_before, prob_after, data->answerId')
    .order('bet_id')
  q = applyBetsFilter(q, {
    contractId,
    limit: 50000,
    ...options,
  })
  const { data } = await run(q)

  return data
    .filter((r: any) => r.prob_after != r.prob_before)
    .map((r: any) => ({
      x: tsToMillis(r.created_time),
      y: r.prob_after as number,
      answerId: r.answerId as string,
    }))
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

export type PositionChangeData = {
  previous: {
    invested: number
    outcome: string
    answerId: string | undefined // undefined for binary contracts
  } | null // null for no position
  current: {
    invested: number
    outcome: string
    answerId: string | undefined // undefined for binary contracts
  } | null // null for no position
  change: number
  startTime: number
  endTime: number
  beforeProb: number
  afterProb: number
}

const IGNORE_ABOVE_PROB = 0.9
const IGNORE_BELOW_PROB = 0.1

export const getUserMostChangedPosition = async (
  bettor: User,
  contract: Contract,
  since: number,
  db: SupabaseClient
) => {
  const now = Date.now()
  const bets = await getBets(db, {
    contractId: contract.id,
    order: 'desc',
    userId: bettor.id,
    beforeTime: now,
    isOpenLimitOrder: false,
  })
  const previousBets = bets.filter((b) => b.createdTime < since)
  const allBetsByAnswer = groupBy(bets, (b) => b.answerId)
  const previousBetsByAnswer = groupBy(previousBets, (b) => b.answerId)
  const investedByAnswer = Object.entries(allBetsByAnswer).map(
    ([answerId, bets]) => {
      const recentBets = bets.filter((b) => b.createdTime >= since)
      const beforeProb = minBy(recentBets, 'createdTime')?.probBefore ?? 0
      const afterProb = maxBy(recentBets, 'createdTime')?.probAfter ?? 0
      // Ignore bets milking the AMM for the last few drops
      if (
        (beforeProb > IGNORE_ABOVE_PROB && afterProb > IGNORE_ABOVE_PROB) ||
        (beforeProb < IGNORE_BELOW_PROB && afterProb < IGNORE_BELOW_PROB)
      ) {
        return [
          answerId,
          {
            change: null,
          },
        ] as const
      }

      const previousMetrics = getContractBetMetrics(
        contract,
        previousBetsByAnswer[answerId] ?? []
      )
      const previous = previousMetrics.maxSharesOutcome
        ? removeUndefinedProps({
            invested: Math.round(previousMetrics.invested),
            outcome: previousMetrics.maxSharesOutcome,
            answerId: bets[0].answerId,
          })
        : null
      const currentMetrics = getContractBetMetrics(contract, bets)
      const current = currentMetrics.maxSharesOutcome
        ? removeUndefinedProps({
            invested: Math.round(currentMetrics.invested),
            outcome: currentMetrics.maxSharesOutcome,
            answerId: bets[0].answerId,
          })
        : null
      const change =
        previous?.outcome === current?.outcome
          ? (current?.invested ?? 0) - (previous?.invested ?? 0)
          : (current?.invested ?? 0) + (previous?.invested ?? 0)

      return [
        answerId,
        {
          previous,
          current,
          change,
          startTime: since,
          endTime: now,
          beforeProb: parseFloat(beforeProb.toPrecision(2)),
          afterProb: parseFloat(afterProb.toPrecision(2)),
        } as PositionChangeData,
      ] as const
    }
  )

  const max = maxBy(
    investedByAnswer.filter(([, v]) => v.change !== null),
    ([, v]) => Math.abs(v.change ?? 0)
  )
  if (!max) return undefined

  return {
    ...max[1],
  } as PositionChangeData
}
