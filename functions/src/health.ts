import { newEndpoint } from './api'

export const health = newEndpoint(['GET'], async (_req, auth) => {
  return {
    message: 'Server is working.',
    uid: auth.uid,
  }
})
