import { APIHandler } from 'api/helpers/endpoint'
import { calculateRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getRedeemablePrizeCash: APIHandler<
  'get-redeemable-prize-cash'
> = async (props, auth) => {
  const pg = createSupabaseDirectClient()
  const redeemablePrizeCash = await calculateRedeemablePrizeCash(auth.uid, pg)
  return { redeemablePrizeCash }
}
