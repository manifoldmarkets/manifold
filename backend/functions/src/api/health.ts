import { newEndpoint } from './helpers'

export const health = newEndpoint({ method: 'GET' }, async (_req, auth) => {
  return {
    message: 'Server is working.',
    uid: auth.uid,
  }
})
