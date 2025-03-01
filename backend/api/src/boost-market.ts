import { APIError, authEndpoint } from './helpers/endpoint'

export const boostmarket = authEndpoint(async () => {
  throw new APIError(403, 'Boosts are no longer available')
})
