import { newEndpoint } from './api'

export const health = newEndpoint({ methods: ['GET'] }, async (_req, auth) => {
  return {
    message: 'Server is working.',
    uid: auth.uid,
  }
})
