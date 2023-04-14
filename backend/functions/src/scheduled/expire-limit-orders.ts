import * as functions from 'firebase-functions'
import { createSupabaseClient } from 'shared/supabase/init'
import { LimitBet } from 'common/bet'
import * as admin from 'firebase-admin'
import { secrets } from 'shared/secrets'
const firestore = admin.firestore()

export const expireLimitOrdersScheduler = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .pubsub.schedule('*/10 * * * *')
  .onRun(expireLimitOrders)

export async function expireLimitOrders() {
  // get all unfilled limit order bets
  const db = createSupabaseClient()
  const { data } = await db
    .from('contract_bets')
    .select('data')
    .eq('data->>isFilled', false)
    .eq('data->>isCancelled', false)
    .eq('data->>isAnte', false)
    .eq('data->>isRedemption', false)
    .neq('data->>expiresAt', null)
    .lt('data->>expiresAt', Date.now())
  if (!data) {
    console.log('no bets to cancel')
    return
  }
  console.log('cancelling', data.length, 'bets')
  // for each bet, cancel it
  await Promise.all(
    data.map(async (datum) => {
      const bet = datum.data as LimitBet
      return await firestore
        .collection(`contracts/${bet.contractId}/bets`)
        .doc(bet.id)
        .update({
          isCancelled: true,
        })
    })
  )
}
