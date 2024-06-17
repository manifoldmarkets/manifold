import { APIError, APIHandler } from 'api/helpers/endpoint'
import * as crypto from 'crypto'
import { getIp } from 'shared/analytics'
import { getPrivateUserSupabase, log } from 'shared/utils'
import { getPhoneNumber } from 'shared/helpers/get-phone-number'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  otherErrorCodes,
  hasIdentityError,
  blockedCodes,
  allowedFlaggedCodes,
  locationTemporarilyBlockedCodes,
} from 'common/reason-codes'
import { intersection } from 'lodash'
import { getGIDXStandardParams } from 'shared/gidx/standard-params'
const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/CustomerIdentity/CustomerRegistration'

export const registerGIDX: APIHandler<'register-gidx'> = async (
  props,
  auth,
  req
) => {
  const pg = createSupabaseDirectClient()
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
  const standardParams = getStandardParams(ip, gps)
  const body = {
    // TODO: add back in prod
    // MerchantCustomerID: auth.uid,,
    // EmailAddress: user.email,
    // MobilePhoneNumber: parsePhoneNumber(phoneNumberWithCode)?.nationalNumber ?? phoneNumberWithCode,
    ...standardParams,
    ...rest,
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

  // Timeouts or input errors
  const errorCodes = intersection(otherErrorCodes, ReasonCodes)
  if (errorCodes.length > 0) {
    log('Registration failed, resulted in error codes:', errorCodes)
    await updateUser(pg, auth.uid, { kycStatus: 'failed' })
    return { status: 'error', ReasonCodes }
  }

  // User identity match is low confidence or attempt may be fraud
  if (FraudConfidenceScore < 50 || IdentityConfidenceScore < 50) {
    log(
      'Registration failed, resulted in low confidence scores:',
      FraudConfidenceScore,
      IdentityConfidenceScore
    )
    await updateUser(pg, auth.uid, { kycStatus: 'failed' })
    return {
      status: 'error',
      ReasonCodes,
      FraudConfidenceScore,
      IdentityConfidenceScore,
    }
  }

  // User identity not found/verified
  if (hasIdentityError(ReasonCodes)) {
    log('Registration failed, resulted in identity errors:', ReasonCodes)
    await updateUser(pg, auth.uid, { kycStatus: 'failed' })
    return { status: 'error', ReasonCodes }
  } else await updateUser(pg, auth.uid, { kycMatch: true })

  // User is flagged for unknown address, vpn, unclear DOB, distance between attempts
  const allowedFlags = intersection(allowedFlaggedCodes, ReasonCodes)
  if (allowedFlags.length > 0) {
    await updateUser(pg, auth.uid, { kycFlags: allowedFlags })
  }

  // User is in disallowed location, but they may move
  if (intersection(locationTemporarilyBlockedCodes, ReasonCodes).length > 0) {
    log(
      'Registration failed, resulted in temporary blocked location codes:',
      ReasonCodes
    )
    await updateUser(pg, auth.uid, { kycStatus: 'failed' })
    return { status: 'error', ReasonCodes }
  }

  // User is blocked for any number of reasons
  const blockedReasonCodes = intersection(blockedCodes, ReasonCodes)
  if (blockedReasonCodes.length > 0) {
    log('Registration failed, resulted in blocked codes:', blockedReasonCodes)
    await updateUser(pg, auth.uid, { kycStatus: 'blocked' })
    return { status: 'error', ReasonCodes }
  }

  // User is not blocked and ID is verified
  if (ReasonCodes.includes('ID-VERIFIED')) {
    log('Registration passed with allowed codes:', ReasonCodes)
    await updateUser(pg, auth.uid, { kycStatus: 'verified' })
    return { status: 'success', ReasonCodes }
  }

  log.error(
    `Registration failed with unknown reason codes: ${ReasonCodes.join(', ')}`
  )
  return { status: 'error', ReasonCodes }
}

type GIDXRegistrationResponse = {
  MerchantCustomerID: string
  ReasonCodes: string[]
  WatchChecks: WatchCheckType[]
  ProfileMatch: ProfileMatchType
  IdentityConfidenceScore: number
  FraudConfidenceScore: number
  CustomerRegistrationLink: string
  LocationDetail: LocationDetailType
  ResponseCode: number
  ResponseMessage: string
  ProfileMatches: ProfileMatchType[]
}

type WatchCheckType = {
  SourceCode: string
  SourceScore: number
  MatchResult: boolean
  MatchScore: number
}

type ProfileMatchType = {
  NameMatch: boolean
  AddressMatch: boolean
  EmailMatch: boolean
  IdDocumentMatch: boolean
  PhoneMatch: boolean
  MobilePhoneMatch: boolean
  DateOfBirthMatch: boolean
  CitizenshipMatch: boolean
}

type LocationDetailType = {
  Latitude: number
  Longitude: number
  Radius: number
  Altitude: number
  Speed: number
  LocationDateTime: string
  LocationStatus: number
  LocationServiceLevel: string
  ReasonCodes: string[]
  ComplianceLocationStatus: boolean
  ComplianceLocationServiceStatus: string
  IdentifierType: string
  IdentifierUsed: string
}
