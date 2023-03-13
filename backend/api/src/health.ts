import { authEndpoint } from './helpers'

export const health = authEndpoint(async (_req, auth) => {
  return {
    message: 'Server is working.',
    uid: auth.uid,
  }
})
