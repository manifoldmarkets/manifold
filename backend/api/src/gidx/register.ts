import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  ENABLE_FAKE_CUSTOMER,
  GIDXRegistrationResponse,
} from 'common/gidx/gidx'
import { parsePhoneNumber } from 'libphonenumber-js'
import { getIp, track } from 'shared/analytics'
import { distributeKycBonus } from 'shared/distribute-kyc-bonus'
import {
  getGIDXStandardParams,
  getLocalServerIP,
  getUserRegistrationRequirements,
  GIDX_BASE_URL,
  throwIfIPNotWhitelisted,
  verifyReasonCodes,
} from 'shared/gidx/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUserIdFromReferralCode, updateUser } from 'shared/supabase/users'
import { getUser, LOCAL_DEV, log } from 'shared/utils'

const ENDPOINT =
  GIDX_BASE_URL + '/v3.0/api/CustomerIdentity/CustomerRegistration'

export const register: APIHandler<'register-gidx'> = async (
  props,
  auth,
  req
) => {
  const { privateUser, phoneNumberWithCode } =
    await getUserRegistrationRequirements(auth.uid)
  const EmailAddress = props.EmailAddress ?? privateUser.email
  if (!EmailAddress) {
    throw new APIError(400, 'User must have an email address')
  }
  const { ReferralCode } = props
  const pg = createSupabaseDirectClient()
  const referrerInfo = await getUserIdFromReferralCode(pg, ReferralCode)
  if (!referrerInfo && ReferralCode) {
    throw new APIError(400, 'Invalid referral code')
  }
  if (referrerInfo && referrerInfo.id === auth.uid) {
    throw new APIError(400, 'Cannot refer yourself')
  }
  const body = {
    EmailAddress,
    CountryCode: 'US',
    MobilePhoneNumber: ENABLE_FAKE_CUSTOMER
      ? props.MobilePhoneNumber
      : parsePhoneNumber(phoneNumberWithCode)?.nationalNumber ??
        phoneNumberWithCode,
    DeviceIpAddress: ENABLE_FAKE_CUSTOMER
      ? props.DeviceIpAddress
      : LOCAL_DEV
      ? await getLocalServerIP()
      : getIp(req),
    MerchantCustomerID: auth.uid,
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
    throw new APIError(400, 'GIDX registration failed')
  }
  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, 'User not found')
  }
  const data = (await res.json()) as GIDXRegistrationResponse
  log('Registration response:', data)
  const {
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore,
    ResponseCode,
    ResponseMessage,
  } = data
  throwIfIPNotWhitelisted(ResponseCode, ResponseMessage)
  const { status, message, idVerified } = await verifyReasonCodes(
    { user, privateUser },
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore
  )
  if (referrerInfo) {
    // If they didn't get verified right now, they might upload docs and get verified later
    await updateUser(pg, auth.uid, {
      referredByUserId: referrerInfo.id,
      usedReferralCode: true,
    })
  }
  if (status !== 'error') {
    await updateUser(pg, auth.uid, {
      kycDocumentStatus: 'await-documents',
      sweepstakesVerifiedTime: Date.now(),
    })
    await distributeKycBonus(pg, user)
  }
  track(auth.uid, 'register user gidx attempt', {
    status,
    message,
    idVerified,
  })
  return {
    status,
    message,
    idVerified: idVerified,
  }
}
