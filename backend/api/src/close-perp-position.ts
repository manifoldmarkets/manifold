import { PERPS_ENABLED } from 'common/envs/constants'
import { closePosition } from 'shared/perps/engine'
import { APIError, APIHandler } from './helpers/endpoint'

export const closePerpPosition: APIHandler<'close-perp-position'> = async (
  body,
  auth
) => {
  if (!PERPS_ENABLED) throw new APIError(403, 'Perps are disabled')
  const { contractId, direction } = body
  return await closePosition(contractId, auth.uid, direction)
}
