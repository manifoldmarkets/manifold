import { APIError, APIHandler } from 'api/helpers/endpoint'
import { LOCAL_DEV, log } from 'shared/utils'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  blockedCodes,
  hasIdentityError,
  limitTo5kCashoutCodes,
  locationBlockedCodes,
  locationTemporarilyBlockedCodes,
  otherErrorCodes,
  RegistrationReturnType,
  timeoutCodes,
  underageErrorCodes,
} from 'common/reason-codes'
import { intersection } from 'lodash'
import {
  getGIDXStandardParams,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import {
  ENABLE_FAKE_CUSTOMER,
  GIDXRegistrationResponse,
  ID_ERROR_MSG,
  LOCAL_IP,
} from 'common/gidx/gidx'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { parsePhoneNumber } from 'libphonenumber-js'
import { getIp } from 'shared/analytics'

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
      ? LOCAL_IP
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

  const data = (await res.json()) as GIDXRegistrationResponse
  log('Registration response:', data)
  const { ReasonCodes, FraudConfidenceScore, IdentityConfidenceScore } = data
  const { status, message, idVerified } = await verifyReasonCodes(
    auth.uid,
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore
  )
  const pg = createSupabaseDirectClient()
  if (status === 'success') {
    await updateUser(pg, auth.uid, {
      sweepstakesVerified: true,
      kycDocumentStatus: 'await-documents',
    })
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

// TODO: pass user object to determine whether to update user or not
export const verifyReasonCodes = async (
  userId: string,
  ReasonCodes: string[],
  FraudConfidenceScore: number | undefined,
  IdentityConfidenceScore: number | undefined
): Promise<RegistrationReturnType> => {
  const pg = createSupabaseDirectClient()

  const hasAny = (codes: string[]) =>
    intersection(codes, ReasonCodes).length > 0
  const idVerified = ReasonCodes.includes('ID-VERIFIED')
  if (ReasonCodes.length > 0) {
    await updateUser(pg, userId, { kycFlags: ReasonCodes })
  }
  if (idVerified) {
    await updateUser(pg, userId, {
      idVerified: true,
      sweepstakes5kLimit: hasAny(limitTo5kCashoutCodes),
    })
  } else {
    await updateUser(pg, userId, {
      idVerified: false,
      sweepstakesVerified: false,
    })
  }
  // Timeouts or input errors
  if (hasAny(otherErrorCodes)) {
    log('Registration failed, resulted in error codes:', ReasonCodes)
    await updateUser(pg, userId, { sweepstakesVerified: false })
    if (hasAny(timeoutCodes)) {
      return {
        status: 'error',
        message: 'Registration timed out, please try again.',
        idVerified,
      }
    }
    if (ReasonCodes.includes('LL-FAIL')) {
      return {
        status: 'error',
        message:
          'Registration failed, location error. Check your location information.',
        idVerified,
      }
    }
  }

  if (hasAny(['PAY-HVEL-CL', 'PAY-HVEL-CKI'])) {
    const userType = ReasonCodes.includes('PAY-HVEL-CKI')
      ? 'Fully KYC (Internally) Customer'
      : 'user'
    return {
      status: 'error',
      message: `High velocity of payments detected for ${userType}.`,
      idVerified,
    }
  }

  // User identity not found/verified
  if (hasIdentityError(ReasonCodes)) {
    log('Registration failed, resulted in identity errors:', ReasonCodes)

    await updateUser(pg, userId, { sweepstakesVerified: false })
    return {
      status: 'error',
      message: ID_ERROR_MSG,
      idVerified,
    }
  }

  // User is blocked for any number of reasons
  const blockedReasonCodes = intersection(blockedCodes, ReasonCodes)
  if (blockedReasonCodes.length > 0) {
    log('Registration failed, resulted in blocked codes:', blockedReasonCodes)
    await updateUser(pg, userId, { sweepstakesVerified: false })
    if (hasAny(locationBlockedCodes)) {
      return {
        status: 'error',
        message: 'Registration failed, location blocked or high risk.',
        idVerified,
      }
    }
    if (hasAny(underageErrorCodes)) {
      return {
        status: 'error',
        message: 'Registration failed, you must be 18+, (19+ in some states).',
        idVerified,
      }
    }
    if (ReasonCodes.includes('ID-EX')) {
      return {
        status: 'error',
        message: 'Registration failed, ID exists already. Contact admins.',
        idVerified,
      }
    }
    return {
      status: 'error',
      message: 'Registration failed, you are blocked.',
      idVerified,
    }
  }

  // User is in disallowed location, but they may move
  if (hasAny(locationTemporarilyBlockedCodes)) {
    log(
      'Registration failed, resulted in temporary blocked location codes:',
      ReasonCodes
    )
    await updateUser(pg, userId, {
      sweepstakesVerified: false,
      kycLastAttempt: Date.now(),
    })
    return {
      status: 'error',
      message:
        'Registration failed, location blocked. Try again in 3 hours in an allowed location.',
      idVerified,
    }
  }

  // User identity match is low confidence or attempt may be fraud
  if (
    FraudConfidenceScore !== undefined &&
    IdentityConfidenceScore !== undefined &&
    (FraudConfidenceScore < 80 || IdentityConfidenceScore < 80)
  ) {
    log(
      'Registration failed, resulted in low confidence scores:',
      FraudConfidenceScore,
      IdentityConfidenceScore
    )
    await updateUser(pg, userId, { sweepstakesVerified: false })
    return {
      status: 'error',
      message:
        'Confidence in identity or fraud too low. Double check your information.',
      idVerified,
    }
  }

  // User is not blocked and ID is verified
  if (ReasonCodes.includes('ID-VERIFIED')) {
    log('Registration passed with allowed codes:', ReasonCodes)
    return { status: 'success', idVerified }
  }

  log(
    `Registration failed for ${userId} with no matched reason codes: ${ReasonCodes.join(
      ', '
    )}`
  )
  return {
    status: 'error',
    message:
      'Registration failed, ask admin about codes: ' + ReasonCodes.join(', '),
    idVerified,
  }
}
