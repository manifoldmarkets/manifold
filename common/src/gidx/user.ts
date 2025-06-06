import { FRAUD_THRESHOLD } from 'common/gidx/gidx'
import {
  identityBlockedCodes,
  locationBlockedCodes,
  underageErrorCodes,
} from 'common/reason-codes'
import { humanish, PrivateUser, User } from 'common/user'
import { intersection } from 'lodash'

export const blockFromSweepstakes = (user: User | undefined | null) =>
  user && (!user.idVerified || !user.sweepstakesVerified)
export const locationBlocked = (user: User, privateUser: PrivateUser) =>
  [LOCATION_BLOCKED_MESSAGE, LOCATION_BLOCKED_TIME_MESSAGE].includes(
    getVerificationStatus(user, privateUser).message
  )
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
  if (!user || !privateUser) {
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
      if (privateUser.kycFlags?.includes('LL-ALERT-DIST')) {
        return { status: 'error', message: LOCATION_BLOCKED_TIME_MESSAGE }
      }
      return { status: 'error', message: LOCATION_BLOCKED_MESSAGE }
    }
    return { status: 'error', message: USER_BLOCKED_MESSAGE }
  } else if (user.sweepstakesVerified) {
    return { status: 'success', message: USER_VERIFIED_MESSSAGE }
  } else {
    return { status: 'error', message: USER_NOT_REGISTERED_MESSAGE }
  }
}

const USER_IS_UNDEFINED_MESSAGE = 'Please sign in or sign up'
const PHONE_NOT_VERIFIED_MESSAGE = 'User must verify phone'
const IDENTIFICATION_FAILED_MESSAGE = 'User identification failed'
const LOCATION_BLOCKED_MESSAGE = 'User location is blocked'
const LOCATION_BLOCKED_TIME_MESSAGE =
  'User is blocked due to rapid changes in location. Try again in 3 hours.'
const USER_BLOCKED_MESSAGE =
  'User is not eligible to trade on sweepstakes markets.'
const USER_UNDERAGE_MESSAGE = 'User is underage'
const USER_IDENTITY_BLOCKED_MESSAGE = 'User identity is blocked'
const USER_FRAUD_MESSAGE =
  'Your current activity was marked as suspicious, please turn off VPN if using. You may have to wait for a few hours for your account to be unblocked.'
const USER_NOT_REGISTERED_MESSAGE = 'User must register'
const USER_VERIFIED_MESSSAGE = 'User is verified'
const USER_PENDING_VERIFICATION_MESSAGE = 'User is pending verification'
const USER_DOCUMENT_FAILED_MESSAGE = 'User document verification failed'
export const PROMPT_USER_VERIFICATION_MESSAGES = [
  USER_NOT_REGISTERED_MESSAGE,
  PHONE_NOT_VERIFIED_MESSAGE,
  IDENTIFICATION_FAILED_MESSAGE,
]
