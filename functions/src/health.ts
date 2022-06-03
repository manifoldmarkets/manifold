import { newEndpoint } from './api'

export const health = newEndpoint(['GET'], async (_req, [user, _]) => {
  return {
    message: 'Server is working.',
    user: {
      id: user.id,
      username: user.username,
    },
  }
})
