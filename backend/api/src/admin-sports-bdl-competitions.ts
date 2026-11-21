import { getBdlOperatorPanel } from 'shared/bdl/operator-panel-queries'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import type { APIHandler } from './helpers/endpoint'

export const adminSportsBdlCompetitions: APIHandler<
  'admin-sports-bdl-competitions'
> = async (_props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  return getBdlOperatorPanel(createSupabaseDirectClient())
}
