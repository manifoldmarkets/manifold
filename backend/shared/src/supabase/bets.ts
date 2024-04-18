import { SupabaseDirectClient } from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'
import { ContractComment } from 'common/comment'

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
