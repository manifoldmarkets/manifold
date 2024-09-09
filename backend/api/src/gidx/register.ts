import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getUser, LOCAL_DEV, log } from 'shared/utils'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getGIDXStandardParams,
  getLocalServerIP,
  getUserRegistrationRequirements,
  verifyReasonCodes,
} from 'shared/gidx/helpers'
import {
  ENABLE_FAKE_CUSTOMER,
  GIDXRegistrationResponse,
} from 'common/gidx/gidx'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { parsePhoneNumber } from 'libphonenumber-js'
import { getIp } from 'shared/analytics'
import { distributeKycBonus } from 'shared/distribute-kyc-bonus'

const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerRegistration'

export const register: APIHandler<'register-gidx'> = async (
  props,
  auth,
  req
) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const { privateUser, phoneNumberWithCode } =
    await getUserRegistrationRequirements(auth.uid)
  const EmailAddress = props.EmailAddress ?? privateUser.email
  if (!EmailAddress) {
    throw new APIError(400, 'User must have an email address')
  }
  const body = {
    EmailAddress,
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
  const pg = createSupabaseDirectClient()
  const user = await getUser(auth.uid, pg)
  if (!user) {
    throw new APIError(400, 'User not found')
  }
  const data = (await res.json()) as GIDXRegistrationResponse
  log('Registration response:', data)
  const { ReasonCodes, FraudConfidenceScore, IdentityConfidenceScore } = data
  const { status, message, idVerified } = await verifyReasonCodes(
    user,
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore
  )
  if (status === 'success') {
    await updateUser(pg, auth.uid, {
      sweepstakesVerified: true,
      kycDocumentStatus: 'await-documents',
    })
    await distributeKycBonus(pg, user.id)
  } else if (idVerified) {
    await updateUser(pg, auth.uid, {
      kycDocumentStatus: 'await-documents',
    })
  }
  return {
    status,
    message,
    idVerified: idVerified,
  }
}
