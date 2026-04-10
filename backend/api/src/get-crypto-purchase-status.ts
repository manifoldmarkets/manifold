import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from 'api/helpers/endpoint'

export const getCryptoPurchaseStatus: APIHandler<
  'get-crypto-purchase-status'
> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const userId = auth.uid

  const result = await pg.oneOrNone<{ count: string }>(
    `SELECT COUNT(*) as count FROM crypto_payment_intents WHERE user_id = $1`,
    [userId]
  )

  const hasCryptoPurchase = result ? parseInt(result.count) > 0 : false

  return { hasCryptoPurchase }
}
