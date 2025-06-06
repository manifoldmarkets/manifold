import { APIError, APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
export const getRedeemablePrizeCash: APIHandler<
  'get-redeemable-prize-cash'
> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const user = await getUser(auth.uid, pg)
  if (!user) {
    throw new APIError(404, 'User not found')
  }
  return { redeemablePrizeCash: user.cashBalance }
}
