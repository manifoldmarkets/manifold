import * as functions from 'firebase-functions'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'

export const expireLimitOrdersScheduler = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .pubsub.schedule('*/10 * * * *')
  .onRun(expireLimitOrders)

export async function expireLimitOrders() {
  const pg = createSupabaseDirectClient()

  const { count } = await pg.one(`
    update contract_bets
    set data = data || '{"isCancelled": true}'
    where data->>'isFilled' = false
    and data->>'isCancelled' = false
    and data->>'expiresAt' < ts_to_millis(now())
    returning count(*)
  `)

  console.log(`Expired ${count} limit orders`)
}
