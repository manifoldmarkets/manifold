import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getPrivateUserSupabase, log } from 'shared/utils'
import { getPhoneNumber } from 'shared/helpers/get-phone-number'
import { getGIDXStandardParams } from 'shared/gidx/standard-params'
import {
  GIDX_REGISTATION_ENABLED,
  GIDXVerificationResponse,
} from 'common/gidx/gidx'
const ENDPOINT = 'https://api.gidx-service.in/v3.0/api/WebReg/CreateSession'
export const getVerificationSession: APIHandler<
  'get-verification-session-gidx'
> = async (props, auth) => {
  if (!GIDX_REGISTATION_ENABLED)
    throw new APIError(400, 'GIDX registration is disabled')
  const user = await getPrivateUserSupabase(auth.uid)
  if (!user) {
    throw new APIError(404, 'Private user not found')
  }
  if (!user.email) {
    throw new APIError(400, 'User must have an email address')
  }
  const phoneNumberWithCode = await getPhoneNumber(auth.uid)
  if (!phoneNumberWithCode) {
    throw new APIError(400, 'User must have a phone number')
  }
  const body = {
    // TODO: add back in prod
    // MerchantCustomerID: auth.uid,,
    // EmailAddress: user.email,
    // MobilePhoneNumber: parsePhoneNumber(phoneNumberWithCode)?.nationalNumber ?? phoneNumberWithCode,
    // DeviceIpAddress: getIp(req),
    CustomerIpAddress: props.DeviceIpAddress,
    // CallbackURL: 'https://api.manifold.markets/v0/gidx/verification-callback',
    CallbackURL:
      'https://enabled-bream-sharply.ngrok-free.app/v0/callback-gidx',
    ...getGIDXStandardParams(),
    ...props,
  }
  log('Registration request:', body)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new APIError(400, 'GIDX verification session failed')
  }

  const data = (await res.json()) as GIDXVerificationResponse
  log('Registration response:', data)
  return data
}
