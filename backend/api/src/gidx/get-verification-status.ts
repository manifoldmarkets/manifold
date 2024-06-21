import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getPrivateUserSupabase, log } from 'shared/utils'
import { getPhoneNumber } from 'shared/helpers/get-phone-number'
import { getGIDXStandardParams } from 'shared/gidx/standard-params'
import { GIDX_REGISTATION_ENABLED, GIDXDocument } from 'common/gidx/gidx'
// TODO this endpoint returns a 404, the endpoint doesn't exist...
const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DocumentLibrary/CustomerDocument'

export const getVerificationStatus: APIHandler<
  'get-verification-status-gidx'
> = async (_, auth) => {
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
  // TODO: Handle more than just check on their document upload. Let them know if they've failed, blocked, not yet started, etc.

  const body = {
    MerchantCustomerID: auth.uid,
    ...getGIDXStandardParams(),
  }
  const queryParams = new URLSearchParams(body as any).toString()
  const urlWithParams = `${ENDPOINT}?${queryParams}`

  const res = await fetch(urlWithParams)
  if (!res.ok) {
    throw new APIError(400, 'GIDX verification session failed')
  }

  const data = (await res.json()) as {
    ResponseCode: number
    ResponseMessage: string
    MerchantCustomerID: string
    DocumentCount: number
    Documents: GIDXDocument[]
  }
  log(
    'Registration response:',
    data.ResponseMessage,
    'docs',
    data.DocumentCount,
    'userId',
    data.MerchantCustomerID
  )
  return {
    status: 'success',
  }
}
