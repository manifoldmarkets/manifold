import * as crypto from 'crypto'
import { APIError } from 'common/api/utils'
import {
  GIDXCustomerProfile,
  ID_ERROR_MSG,
  IDENTITY_AND_FRAUD_THRESHOLD,
} from 'common/gidx/gidx'
import { getPrivateUserSupabase, getUser, log } from 'shared/utils'
import { getPhoneNumber } from 'shared/helpers/get-phone-number'
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
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { intersection } from 'lodash'
import { updatePrivateUser, updateUser } from 'shared/supabase/users'
import { User } from 'common/user'

export const getGIDXStandardParams = (MerchantSessionID?: string) => ({
  // TODO: before merging into main, switch from sandbox key to production key in prod
  ApiKey: process.env.GIDX_API_KEY,
  MerchantID: process.env.GIDX_MERCHANT_ID,
  ProductTypeID: process.env.GIDX_PRODUCT_TYPE_ID,
  DeviceTypeID: process.env.GIDX_DEVICE_TYPE_ID,
  ActivityTypeID: process.env.GIDX_ACTIVITY_TYPE_ID,
  MerchantSessionID: MerchantSessionID ?? crypto.randomUUID(),
})

export const getGIDXCustomerProfile = async (userId: string) => {
  const ENDPOINT =
    'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerProfile'
  const body = {
    ...getGIDXStandardParams(),
    MerchantCustomerID: userId,
  } as Record<string, string>
  const queryParams = new URLSearchParams(body).toString()
  const urlWithParams = `${ENDPOINT}?${queryParams}`

  const res = await fetch(urlWithParams)
  if (!res.ok) {
    throw new APIError(400, 'GIDX verification session failed')
  }
  return (await res.json()) as GIDXCustomerProfile
}

export const getUserRegistrationRequirements = async (userId: string) => {
  const privateUser = await getPrivateUserSupabase(userId)
  if (!privateUser) {
    throw new APIError(404, 'Private user not found')
  }
  const phoneNumberWithCode = await getPhoneNumber(userId)
  if (!phoneNumberWithCode) {
    throw new APIError(400, 'User must have a phone number')
  }
  return { privateUser, phoneNumberWithCode }
}

export const getUserSweepstakesRequirements = async (userId: string) => {
  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }
  if (!user.idVerified) {
    throw new APIError(400, 'User must register first')
  }
  return user
}

// Alternative ip addresses of interest for testing
// '68.173.149.14' // NY city
// '73.28.110.120' // Florida
export const getLocalServerIP = async () => {
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    log('Got server ip', data.ip)
    return data.ip
  } catch (error) {
    log.error('Error fetching public IP:', { error })
    return '127.0.0.1'
  }
}

export const verifyReasonCodes = async (
  user: User,
  ReasonCodes: string[],
  FraudConfidenceScore: number | undefined,
  IdentityConfidenceScore: number | undefined
): Promise<RegistrationReturnType> => {
  const pg = createSupabaseDirectClient()
  const userId = user.id

  const hasAny = (codes: string[]) =>
    intersection(codes, ReasonCodes).length > 0
  const idVerified = ReasonCodes.includes('ID-VERIFIED')
  if (ReasonCodes.length > 0) {
    await updatePrivateUser(pg, userId, { kycFlags: ReasonCodes })
  }
  if (idVerified) {
    const updates = {
      idVerified: true,
      sweepstakes5kLimit: hasAny(limitTo5kCashoutCodes),
    }
    if (
      user.idVerified !== updates.idVerified ||
      user.sweepstakes5kLimit !== updates.sweepstakes5kLimit
    ) {
      await updateUser(pg, userId, updates)
    }
  } else {
    const updates = {
      idVerified: false,
      sweepstakesVerified: false,
    }
    if (
      user.idVerified !== updates.idVerified ||
      user.sweepstakesVerified !== updates.sweepstakesVerified
    ) {
      await updateUser(pg, userId, updates)
    }
  }
  // Timeouts or input errors
  if (hasAny(otherErrorCodes)) {
    log('Registration failed, resulted in error codes:', ReasonCodes)
    if (user.sweepstakesVerified !== false) {
      await updateUser(pg, userId, { sweepstakesVerified: false })
    }
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
    if (user.sweepstakesVerified !== false) {
      await updateUser(pg, userId, { sweepstakesVerified: false })
    }
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
    if (user.sweepstakesVerified !== false) {
      await updateUser(pg, userId, { sweepstakesVerified: false })
    }
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
    const updates = {
      sweepstakesVerified: false,
      kycLastAttempt: Date.now(),
    }
    if (
      user.sweepstakesVerified !== updates.sweepstakesVerified ||
      user.kycLastAttempt !== updates.kycLastAttempt
    ) {
      await updateUser(pg, userId, updates)
    }
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
    (FraudConfidenceScore < IDENTITY_AND_FRAUD_THRESHOLD ||
      IdentityConfidenceScore < IDENTITY_AND_FRAUD_THRESHOLD)
  ) {
    log(
      'Registration failed, resulted in low confidence scores:',
      FraudConfidenceScore,
      IdentityConfidenceScore
    )
    if (user.sweepstakesVerified !== false) {
      await updateUser(pg, userId, { sweepstakesVerified: false })
    }
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
