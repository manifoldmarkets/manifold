import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { getSportsAttention } from 'shared/bdl/attention-queries'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'

export const adminSportsBdlAttention: APIHandler<
  'admin-sports-bdl-attention'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  if (!isSportsBdlEnabled()) throw new APIError(404, 'Sports BDL disabled')
  return getSportsAttention(createSupabaseDirectClient(), props)
}
