import { closePosition } from 'shared/perps/engine'
import { APIHandler } from './helpers/endpoint'

// Intentionally does NOT check PERPS_ENABLED — if we flip the flag off we
// still want existing traders to be able to exit their positions. New opens
// are blocked in `place-perp-trade`.
export const closePerpPosition: APIHandler<'close-perp-position'> = async (
  body,
  auth
) => {
  const { contractId, direction } = body
  return await closePosition(contractId, auth.uid, direction)
}
