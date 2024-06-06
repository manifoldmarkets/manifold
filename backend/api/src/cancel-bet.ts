import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers/endpoint'
import { convertBet } from 'common/supabase/bets'
import { cancelLimitOrders } from 'shared/supabase/bets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type LimitBet } from 'common/bet'

export const cancelBet: APIHandler<'bet/cancel/:betId'> = async (
  { betId },
  auth
) => {
  const pg = createSupabaseDirectClient()
  const bet = await pg.tx(async (tx) => {
    const bet = await tx.oneOrNone(
      `select * from contract_bets where bet_id = $1`,
      [betId],
      (row) => (row ? convertBet(row) : null)
    )

    if (!bet) throw new APIError(404, 'Bet not found')
    if (bet.userId !== auth.uid)
      throw new APIError(403, 'You can only cancel your own bets')
    if (bet.limitProb === undefined)
      throw new APIError(403, 'Not a limit order. Cannot cancel.')
    if (bet.isCancelled) throw new APIError(403, 'Bet already cancelled')

    await cancelLimitOrders(tx, [betId])

    return { ...bet, isCancelled: true }
  })
  const now = Date.now()

  await firestore.collection('contracts').doc(bet.contractId).update({
    lastBetTime: now,
    lastUpdatedTime: now,
  })

  return bet as LimitBet
}

const firestore = admin.firestore()
