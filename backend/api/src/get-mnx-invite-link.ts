import { APIError } from 'common/api/utils'
import { getMnxInstrument } from 'common/perps/mnx'
import { mnxLinkUrl } from 'common/perps/mnx-cta'
import { getMnxInvite } from 'shared/mnx-invites'
import { getUser } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'

export const getMnxInviteLink: APIHandler<'get-mnx-invite-link'> = async (
  { feedId, location },
  auth
) => {
  const instrument = getMnxInstrument(feedId)
  if (!instrument) throw new APIError(400, 'Unknown MNX instrument')
  const apiSecret = process.env.API_SECRET
  if (!apiSecret) throw new APIError(503, 'MNX invites are unavailable')

  // Always sign the authenticated user's current username, never caller input.
  const user = await getUser(auth.uid)
  if (!user) throw new APIError(404, 'User not found')
  return {
    url: mnxLinkUrl(
      instrument.url,
      location,
      getMnxInvite(user.username, apiSecret)
    ),
  }
}
