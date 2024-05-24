import { Bet } from 'common/bet'
import { ContractComment } from 'common/comment'
import { convertBet } from 'common/supabase/bets'
import { removeUndefinedProps } from 'common/util/object'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkInsert, insert } from 'shared/supabase/utils'

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
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await insert(pg, 'contract_bets', betToRow(bet))
}
export const bulkInsertBets = async (
  bets: Omit<Bet, 'id'>[],
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await bulkInsert(pg, 'contract_bets', bets.map(betToRow))
}

const betToRow = (bet: Omit<Bet, 'id'>) => ({
  contract_id: bet.contractId,
  user_id: bet.userId,
  data: JSON.stringify(removeUndefinedProps(bet)) + '::jsonb',
})

export const cancelLimitOrders = async (
  pg: SupabaseDirectClient,
  limitOrderIds: string[]
) => {
  if (limitOrderIds.length > 0) {
    await pg.none(
      `update contract_bets set data = data || '{"isCancelled":true}' where bet_id in ($1:list)`,
      [limitOrderIds]
    )
  }
}
