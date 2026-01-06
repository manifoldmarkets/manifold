import { type APIHandler } from './helpers/endpoint'
import { getUserWithVisibility } from 'api/get-user'

export const getMe: APIHandler<'me'> = async (_, auth) => {
  // Use 'self' visibility so user can see their own modAlert (without mod identity)
  return getUserWithVisibility({ id: auth.uid }, { visibility: 'self' })
}
