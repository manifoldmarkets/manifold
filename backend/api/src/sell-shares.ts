import { APIError, type APIHandler } from './helpers/endpoint'

export const sellShares: APIHandler<'market/:contractId/sell'> = async (
  props,
  auth
) => {
  throw new APIError(500, 'This endpoint is disabled.')
}
