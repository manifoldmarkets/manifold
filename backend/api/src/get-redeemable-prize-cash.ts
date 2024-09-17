import { APIHandler } from 'api/helpers/endpoint'
import { calculateRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getRedeemablePrizeCash: APIHandler<
  'get-redeemable-prize-cash'
> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const { redeemable } = await calculateRedeemablePrizeCash(pg, auth.uid)

  return { redeemablePrizeCash: Math.max(redeemable, 0) }
}
