import { type APIHandler } from './helpers/endpoint'
import { getUser } from 'api/get-user'

export const getMe: APIHandler<'me'> = async (_, auth) => {
  // Use 'self' visibility so user can see their own modAlert (without mod identity)
  return getUser({ id: auth.uid }, { visibility: 'self' })
}
