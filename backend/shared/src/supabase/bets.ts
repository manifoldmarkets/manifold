import { Bet, BetFilter, LimitBet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { convertBet } from 'common/supabase/bets'
import { millisToTs } from 'common/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsert, insert } from 'shared/supabase/utils'
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
  options: BetFilter
) => {
  const {
    contractId,
    userId,
    filterChallenges,
    filterRedemptions,
    filterAntes,
    isOpenLimitOrder,
    afterTime,
    beforeTime,
    commentRepliesOnly,
    answerId,
    includeZeroShareRedemptions,
    order,
    limit: limitValue,
    visibility,
  } = options

  const conditions = buildArray(
    contractId &&
      (Array.isArray(contractId)
        ? where('contract_id = ANY(${contractId})', { contractId })
        : where('contract_id = ${contractId}', { contractId })),

    userId && where('user_id = ${userId}', { userId }),

    isOpenLimitOrder &&
      where(`data->>'isFilled' = 'false' and data->>'isCancelled' = 'false'`),

    afterTime !== undefined &&
      where('created_time > ${afterTime}', {
        afterTime: millisToTs(afterTime),
      }),

    beforeTime !== undefined &&
      where('created_time < ${beforeTime}', {
        beforeTime: millisToTs(beforeTime),
      }),

    commentRepliesOnly && where(`data->>'replyToCommentId' is not null`),

    answerId !== undefined && where('answer_id = ${answerId}', { answerId }),

    filterChallenges && where('is_challenge = false'),

    filterRedemptions && where('is_redemption = false'),

    filterAntes && where('is_ante = false'),

    !includeZeroShareRedemptions &&
      where(
        `(shares != 0 or is_redemption = false or (data->'loanAmount')::numeric != 0)`
      ),

    visibility && [
      join('contracts on contracts.contract_id = contract_bets.contract_id'),
      where('contracts.visibility = ${visibility}', { visibility }),
    ]
  )

  const query = renderSql(
    select('*'),
    from('contract_bets'),
    ...conditions,
    order && orderBy(`created_time ${order.toUpperCase()}`),
    limitValue && limit(limitValue)
  )

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
  pg: SupabaseDirectClient
) => {
  return await insert(pg, 'contract_bets', betToRow(bet))
}
export const bulkInsertBets = async (
  bets: Omit<Bet, 'id'>[],
  pg: SupabaseDirectClient
) => {
  return await bulkInsert(pg, 'contract_bets', bets.map(betToRow))
}

const betToRow = (bet: Omit<Bet, 'id'>) => ({
  contract_id: bet.contractId,
  user_id: bet.userId,
  created_time: millisToTs(bet.createdTime),
  data: JSON.stringify(removeUndefinedProps(bet)) + '::jsonb',
})

export const cancelLimitOrders = async (
  pg: SupabaseDirectClient,
  limitOrderIds: string[]
) => {
  if (limitOrderIds.length > 0) {
    const bets = await pg.map<LimitBet>(
      `update contract_bets
      set data = data || '{"isCancelled":true}'
      where bet_id in ($1:list)
      returning data`,
      [limitOrderIds],
      (r) => r.data
    )

    broadcastOrders(bets)
  }
}
