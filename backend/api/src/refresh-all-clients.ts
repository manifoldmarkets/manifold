import { isAdminId } from 'common/envs/constants'
import { broadcast } from 'shared/websockets/server'
import { type APIHandler, APIError } from './helpers/endpoint'

export const refreshAllClients: APIHandler<'refresh-all-clients'> = async (
  { message },
  auth
) => {
  if (!isAdminId(auth.uid))
    throw new APIError(403, 'Only Manifold team members can refresh clients')

  broadcast('refresh-all-clients', { time: Date.now(), message })
}
