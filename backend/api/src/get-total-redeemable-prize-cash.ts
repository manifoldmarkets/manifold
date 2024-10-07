import { APIHandler } from 'api/helpers/endpoint'
import { calculateTotalRedeemablePrizeCash } from 'shared/calculate-redeemable-prize-cash'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getTotalRedeemablePrizeCash: APIHandler<
  'get-total-redeemable-prize-cash'
> = async () => {
  const pg = createSupabaseDirectClient()

  return { total: await calculateTotalRedeemablePrizeCash(pg) }
}
