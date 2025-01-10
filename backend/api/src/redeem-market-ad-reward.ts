import { APIError, authEndpoint } from './helpers/endpoint'

export const redeemboost = authEndpoint(async () => {
  throw new APIError(403, 'Boosts can no longer be redeemed')
})
