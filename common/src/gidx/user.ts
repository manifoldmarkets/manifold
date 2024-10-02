import { TWOMBA_ENABLED } from 'common/envs/constants'
import { FRAUD_THRESHOLD } from 'common/gidx/gidx'
import { intersection } from 'lodash'
import {
  identityBlockedCodes,
  locationBlockedCodes,
  underageErrorCodes,
} from 'common/reason-codes'
import { humanish, PrivateUser, User } from 'common/user'

export const blockFromSweepstakes = (user: User | undefined | null) =>
  user && (!user.idVerified || !user.sweepstakesVerified)
export const locationBlocked = (user: User, privateUser: PrivateUser) =>
  getVerificationStatus(user, privateUser).message === LOCATION_BLOCKED_MESSAGE
export const ageBlocked = (user: User, privateUser: PrivateUser) =>
  getVerificationStatus(user, privateUser).message === USER_UNDERAGE_MESSAGE
export const identityBlocked = (user: User, privateUser: PrivateUser) =>
  getVerificationStatus(user, privateUser).message ===
  USER_IDENTITY_BLOCKED_MESSAGE
export const fraudSession = (user: User, privateUser: PrivateUser) =>
  getVerificationStatus(user, privateUser).message === USER_FRAUD_MESSAGE
export const documentsFailed = (user: User, privateUser: PrivateUser) =>
  getVerificationStatus(user, privateUser).message ===
  USER_DOCUMENT_FAILED_MESSAGE
export const documentPending = (user: User, privateUser: PrivateUser) =>
  getVerificationStatus(user, privateUser).message ===
  USER_PENDING_VERIFICATION_MESSAGE

export const getVerificationStatus = (
  user: User | undefined | null,
  privateUser: PrivateUser | undefined | null
): {
  status: 'success' | 'error'
  message: string
} => {
  if (!TWOMBA_ENABLED) {
    return { status: 'error', message: GIDX_DISABLED_MESSAGE }
  } else if (!user || !privateUser) {
    return { status: 'error', message: USER_IS_UNDEFINED_MESSAGE }
  } else if (!humanish(user)) {
    return { status: 'error', message: PHONE_NOT_VERIFIED_MESSAGE }
  } else if (user.kycDocumentStatus === 'fail') {
    return { status: 'error', message: USER_DOCUMENT_FAILED_MESSAGE }
  } else if (!user.idVerified && user.kycDocumentStatus === 'pending') {
    return { status: 'error', message: USER_PENDING_VERIFICATION_MESSAGE }
  } else if (!user.idVerified) {
    return { status: 'error', message: IDENTIFICATION_FAILED_MESSAGE }
  } else if (
    privateUser.sessionFraudScore &&
    privateUser.sessionFraudScore < FRAUD_THRESHOLD
  ) {
    return { status: 'error', message: USER_FRAUD_MESSAGE }
  } else if (!user.sweepstakesVerified) {
    if (intersection(privateUser.kycFlags, identityBlockedCodes).length > 0) {
      return { status: 'error', message: USER_IDENTITY_BLOCKED_MESSAGE }
    } else if (
      intersection(privateUser.kycFlags, underageErrorCodes).length > 0
    ) {
      return { status: 'error', message: USER_UNDERAGE_MESSAGE }
    } else if (
      intersection(privateUser.kycFlags, locationBlockedCodes).length > 0
    ) {
      return { status: 'error', message: LOCATION_BLOCKED_MESSAGE }
    }
    return { status: 'error', message: USER_BLOCKED_MESSAGE }
  } else if (user.sweepstakesVerified) {
    return { status: 'success', message: USER_VERIFIED_MESSSAGE }
  } else {
    return { status: 'error', message: USER_NOT_REGISTERED_MESSAGE }
  }
}

const USER_IS_UNDEFINED_MESSAGE = 'User is undefined'
const GIDX_DISABLED_MESSAGE = 'GIDX registration is disabled'
const PHONE_NOT_VERIFIED_MESSAGE = 'User must verify phone'
const IDENTIFICATION_FAILED_MESSAGE = 'User identification failed'
const LOCATION_BLOCKED_MESSAGE = 'User location is blocked'
const USER_BLOCKED_MESSAGE =
  'User is not eligible to trade on sweepstakes markets.'
const USER_UNDERAGE_MESSAGE = 'User is underage'
const USER_IDENTITY_BLOCKED_MESSAGE = 'User identity is blocked'
const USER_FRAUD_MESSAGE =
  'Current user session is marked as possible fraud, please turn off VPN if using'
const USER_NOT_REGISTERED_MESSAGE = 'User must register'
const USER_VERIFIED_MESSSAGE = 'User is verified'
const USER_PENDING_VERIFICATION_MESSAGE = 'User is pending verification'
const USER_DOCUMENT_FAILED_MESSAGE = 'User document verification failed'
export const PROMPT_USER_VERIFICATION_MESSAGES = [
  USER_NOT_REGISTERED_MESSAGE,
  PHONE_NOT_VERIFIED_MESSAGE,
  IDENTIFICATION_FAILED_MESSAGE,
]
