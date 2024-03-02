import { SupabaseDirectClient } from 'shared/supabase/init'
import { convertBet } from 'common/supabase/bets'

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
  commentId: string
) => {
  return await pg.map(
    `select * from contract_bets where data->>'replyToCommentId' = $1`,
    [commentId],
    convertBet
  )
}
