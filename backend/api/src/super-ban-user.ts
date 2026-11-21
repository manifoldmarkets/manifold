import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { superBanUserCore } from 'shared/helpers/super-ban'
import { type APIHandler } from './helpers/endpoint'

export const superBanUser: APIHandler<'super-ban-user'> = async (
  { userId },
  auth
) => {
  throwErrorIfNotMod(auth.uid)
  const result = await superBanUserCore(
    userId,
    auth.uid,
    'Superbanned by moderator'
  )

  return { success: true, ...result }
}
