import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type LimitBet } from 'common/bet'
import { broadcastOrders } from 'shared/websockets/helpers'
import { convertBet } from 'common/supabase/bets'
import { cancelLimitOrdersQuery } from 'shared/supabase/bets'
import { runTransactionWithRetries } from 'shared/transact-with-retries'

export const cancelBet: APIHandler<'bet/cancel/:betId'> = async (
  { betId },
  auth
) => {
  const pg = createSupabaseDirectClient()
  const bet = await pg.oneOrNone(
    `select * from contract_bets where bet_id = $1`,
    [betId],
    convertBet
  )
  if (!bet) throw new APIError(404, 'Bet not found')
  if (bet.userId !== auth.uid)
    throw new APIError(403, 'You can only cancel your own bets')
  if (bet.limitProb === undefined)
    throw new APIError(403, 'Not a limit order. Cannot cancel.')
  if (bet.isCancelled) throw new APIError(403, 'Bet already cancelled')
  const bets = await runTransactionWithRetries(async (tx) => {
    const { query, bets } = cancelLimitOrdersQuery([bet as LimitBet])
    await tx.none(query)
    return bets
  })
  broadcastOrders(bets)

  return bets[0]
}
