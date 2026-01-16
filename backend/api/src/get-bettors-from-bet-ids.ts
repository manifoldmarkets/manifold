import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'

export const getBettorsFromBetIds: APIHandler<
  'get-bettors-from-bet-ids'
> = async (props) => {
  const { betIds } = props

  if (betIds.length === 0) {
    return {}
  }

  const pg = createSupabaseDirectClient()

  // Get user info for all bet IDs in one query
  const results = await pg.manyOrNone<{
    bet_id: string
    user_id: string
    username: string
    name: string
    avatar_url: string
  }>(
    `select 
      b.bet_id, 
      b.user_id,
      u.username,
      u.name
    from contract_bets b
    join users u on b.user_id = u.id
    where b.bet_id = any($1)`,
    [betIds]
  )

  // Build a map of betId -> DisplayUser
  const bettorsByBetId: Record<
    string,
    { id: string; username: string; name: string }
  > = {}

  for (const row of results) {
    bettorsByBetId[row.bet_id] = {
      id: row.user_id,
      username: row.username,
      name: row.name,
    }
  }

  return bettorsByBetId
}
