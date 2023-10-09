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
