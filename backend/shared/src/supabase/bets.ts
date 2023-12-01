import { SupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'

export const getBetsDirect = async (
  pg: SupabaseDirectClient,
  ids: string[]
) => {
  return await pg.map(
    `select data from contract_bets where bet_id in ($1:list)`,
    [ids],
    (row) => row.data as Bet
  )
}
export const getBetsRepliedToComment = async (
  pg: SupabaseDirectClient,
  commentId: string
) => {
  return await pg.map(
    `select data from contract_bets where data->>'replyToCommentId' = $1`,
    [commentId],
    (row) => (row ? (row.data as Bet) : null)
  )
}
