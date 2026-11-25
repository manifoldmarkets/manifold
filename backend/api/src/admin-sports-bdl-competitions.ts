import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { getBdlOperatorPanel } from 'shared/bdl/operator-panel-queries'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'

export const adminSportsBdlCompetitions: APIHandler<
  'admin-sports-bdl-competitions'
> = async (_props, auth) => {
  throwErrorIfNotAdmin(auth.uid)
  if (!isSportsBdlEnabled()) throw new APIError(404, 'Sports BDL disabled')
  return getBdlOperatorPanel(createSupabaseDirectClient())
}
