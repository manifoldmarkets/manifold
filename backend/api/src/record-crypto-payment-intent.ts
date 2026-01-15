import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export const recordCryptoPaymentIntent: APIHandler<
  'record-crypto-payment-intent'
> = async (props, auth) => {
  const { intentId, userId } = props

  // Verify the user is recording their own payment intent
  if (auth.uid !== userId) {
    log.error('User ID mismatch in crypto payment intent:', {
      authUid: auth.uid,
      userId,
    })
    throw new Error('Unauthorized: User ID mismatch')
  }

  if (!intentId) {
    throw new Error('Missing intentId')
  }

  const pg = createSupabaseDirectClient()

  // Insert the payment intent, ignore if already exists
  await pg.none(
    `INSERT INTO crypto_payment_intents (intent_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (intent_id) DO NOTHING`,
    [intentId, userId]
  )

  log('Recorded crypto payment intent:', { intentId, userId })

  return { success: true }
}
