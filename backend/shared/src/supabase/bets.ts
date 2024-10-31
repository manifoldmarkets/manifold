import { Bet, LimitBet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { convertBet } from 'common/supabase/bets'
import { millisToTs } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'
import { pgp, SupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsert, bulkInsertQuery, insert } from 'shared/supabase/utils'
import { broadcastOrders } from 'shared/websockets/helpers'
import {
  from,
  join,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from './sql-builder'
import { buildArray } from 'common/util/array'
import { APIParams } from 'common/api/schema'
import { bulkUpdateUserMetricsWithNewBetsOnly } from 'shared/helpers/user-contract-metrics'
import { ContractMetric } from 'common/contract-metric'

export const getBetsDirect = async (
  pg: SupabaseDirectClient,
  ids: string[]
) => {
  return await pg.map(
    `select * from contract_bets where bet_id in ($1:list)`,
    [ids],
    convertBet
  )
}

export const getBetsWithFilter = async (
  pg: SupabaseDirectClient,
  options: APIParams<'bets'>
) => {
  const {
    contractId,
    userId,
    filterRedemptions,
    afterTime,
    beforeTime,
    commentRepliesOnly,
    answerId,
    includeZeroShareRedemptions,
    order,
    limit: limitValue,
    kinds,
    count,
    points,
  } = options

  const conditions = buildArray(
    !contractId && [
      join('contracts on contracts.id = contract_bets.contract_id'),
      where('contracts.visibility = ${visibility}', { visibility: 'public' }),
    ],

    contractId &&
      (Array.isArray(contractId)
        ? where('contract_id = ANY(${contractId})', { contractId })
        : where('contract_id = ${contractId}', { contractId })),

    userId && where('user_id = ${userId}', { userId }),

    kinds == 'open-limit' &&
      where(
        `contract_bets.is_filled = false and contract_bets.is_cancelled = false`
      ),

    afterTime !== undefined &&
      where('contract_bets.created_time > ${afterTime}', {
        afterTime: millisToTs(afterTime),
      }),

    beforeTime !== undefined &&
      where('contract_bets.created_time < ${beforeTime}', {
        beforeTime: millisToTs(beforeTime),
      }),

    commentRepliesOnly &&
      where(`contract_bets.data->>'replyToCommentId' is not null`),

    answerId !== undefined && where('answer_id = ${answerId}', { answerId }),

    filterRedemptions && where('is_redemption = false'),

    !includeZeroShareRedemptions &&
      where(`(shares != 0 or is_redemption = false or loan_amount != 0)`)
  )
  const selection = count
    ? select('count(contract_bets.*)')
    : points
    ? select(
        'contract_bets.created_time, contract_bets.prob_before, contract_bets.prob_after, contract_bets.answer_id'
      )
    : select('contract_bets.*')

  const ordering = points
    ? orderBy('contract_bets.bet_id')
    : !count &&
      orderBy(
        `contract_bets.created_time ${order ? order.toLowerCase() : 'desc'}`
      )

  const query = renderSql(
    selection,
    from('contract_bets'),
    ...conditions,
    ordering,
    limitValue && limit(limitValue)
  )
  // console.log('getBetsWithFilter query:\n', query)

  return await pg.map(query, {}, convertBet)
}

export const getBetsRepliedToComment = async (
  pg: SupabaseDirectClient,
  comment: ContractComment,
  contractId: string
) => {
  return await pg.map(
    `select * from contract_bets
         where data->>'replyToCommentId' = $1
         and contract_id = $2
         and created_time>=$3
         `,
    [comment.id, contractId, new Date(comment.createdTime).toISOString()],
    convertBet
  )
}

export const insertBet = async (
  bet: Omit<Bet, 'id'>,
  pg: SupabaseDirectClient,
  contractMetrics: ContractMetric[]
) => {
  const [updatedMetrics, insertedBet] = await Promise.all([
    bulkUpdateUserMetricsWithNewBetsOnly(pg, [bet], contractMetrics, true),
    insert(pg, 'contract_bets', betToRow(bet)),
  ])
  return { updatedMetrics, insertedBet }
}

export const insertZeroAmountLimitBet = async (
  bet: Bet,
  pg: SupabaseDirectClient
) => {
  return await insert(pg, 'contract_bets', betToRow(bet))
}

export const bulkInsertBets = async (
  pg: SupabaseDirectClient,
  bets: Bet[],
  contractMetrics: ContractMetric[]
) => {
  const [updatedMetrics, insertedBets] = await Promise.all([
    bulkUpdateUserMetricsWithNewBetsOnly(pg, bets, contractMetrics, true),
    bulkInsert(pg, 'contract_bets', bets.map(betToRow)),
  ])
  return { updatedMetrics, insertedBets }
}
export const bulkInsertBetsQuery = (bets: Bet[]) => {
  return bulkInsertQuery('contract_bets', bets.map(betToRow), false)
}

const betToRow = (bet: Bet | Omit<Bet, 'id'>) =>
  removeUndefinedProps({
    contract_id: bet.contractId,
    user_id: bet.userId,
    bet_id: 'id' in bet ? bet.id : undefined,
    created_time: millisToTs(bet.createdTime),
    data: JSON.stringify(removeUndefinedProps(bet)) + '::jsonb',
  })

export const cancelLimitOrdersQuery = (limitOrders: LimitBet[]) => {
  if (!limitOrders.length) return { query: 'select 1 where false', bets: [] }
  return {
    query: pgp.as.format(
      `update contract_bets
    set data = data || '{"isCancelled":true}'
    where bet_id in ($1:list)`,
      [limitOrders.map((l) => l.id)]
    ),
    bets: limitOrders.map((b) => ({ ...b, isCancelled: true })),
  }
}

export const cancelLimitOrders = async (
  pg: SupabaseDirectClient,
  limitOrders: LimitBet[]
) => {
  if (limitOrders.length > 0) {
    const { query, bets } = cancelLimitOrdersQuery(limitOrders)
    await pg.none(query)
    broadcastOrders(bets)
  }
}
