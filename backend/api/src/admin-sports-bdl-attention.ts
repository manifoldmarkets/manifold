import { getSportsAttention } from 'shared/bdl/attention-queries'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import type { APIHandler } from './helpers/endpoint'

export const adminSportsBdlAttention: APIHandler<
  'admin-sports-bdl-attention'
> = async (props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  return getSportsAttention(createSupabaseDirectClient(), props)
}
