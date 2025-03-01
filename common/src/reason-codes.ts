import { intersection } from 'lodash'

export const timeoutCodes = [
  'LL-TO', // Location timeout
  'DFP-TO', // Device Fingerprint Timeout
]

export const identityErrorCodes = [
  'ID-TO', // Identity Timeout
  'ID-INC', // Identity Incomplete
  'ID-FAIL', // Identity Verification Failure
  'ID-UNKN', // Identity Unknown
]

// ID-VERIFIED supersedes all other identity error codes
export const hasIdentityError = (reasonCodes: string[]) =>
  intersection(identityErrorCodes, reasonCodes).length > 0 &&
  !reasonCodes.includes('ID-VERIFIED')

export const otherErrorCodes: string[] = [
  ...timeoutCodes,
  'LL-FAIL', // Location service failed due to errors
]

export const locationBlockedCodes = [
  'LL-HR', // high risk
  'LL-HR-CO', // high risk country
  'LL-WL', // location on watchlist
  'DFP-HR-CONN', // Device Fingerprint High Risk Connection
  'LL-BLOCK', // location blocked
  'LL-ALERT-DIST', // Large distance between id location attempts
]

export const underageErrorCodes = [
  'ID-UA18', // Identity Under 18
  'ID-UA19', // Identity Under 19
]

export const identityBlockedCodes = [
  'ID-BLOCK', // Identity Blocked
  'ID-HVEL-ACTV', // Identity High Velocity Activity
  'ID-DECEASED', // Identity Deceased
  'ID-EX', // Identity Exists already
  'ID-HR', // Identity High Risk
]

export const blockedCodes: string[] = [
  ...locationBlockedCodes,

  // Identity
  ...underageErrorCodes,
  ...identityBlockedCodes,

  // Device
  'DFP-VPRP-ANON', // Device Fingerprint Anon proxy
  'DFP-WL', // Device Fingerprint on watchlist
  'DFP-HVEL-MIP-WEBREG', // Device Fingerprint High Velocity Matching IP ID Registration
  'DFP-IPNM', // Device Fingerprint IP Not Matching
  'DFP-HR', // Device Fingerprint High Risk
]

export const allowedFlaggedCodes: string[] = [
  'ID-WL', // Identity on watchlist
  'ID-AGE-UNKN', // Identity Age Unknown, typically year is correct
  'ID-ADDR-UPA', // Identity Address Unknown
  'DFP-VPRP', // Device Fingerprint VPN, Proxy, or Relay Provider
  'DFP-VPRP-CORP', // Device Fingerprint Corporate proxy
]

export const allowedCodes: string[] = [
  'ID-VERIFIED', // Identity Verified
  'ID-PASS', // Identity Verification Passed
  'ID-UA21', // Identity Under 21
  'LL-OUT-US', // Location Outside US
]

export const limitTo5kCashoutCodes: string[] = [
  'LL-GEO-US-NY', // Location New York
  'LL-GEO-US-FL', // Location Florida
]

export const uploadedDocsToVerifyIdentity = (reasonCodes: string[]) =>
  ['DOC-REV-COMPL', 'ID-FAIL', 'ID-VERIFIED'].every((code) =>
    reasonCodes.includes(code)
  )

export const documentsReadyCodes: string[] = ['DOC-REV-COMPL', 'DOC-UPLOADED']

export type RegistrationReturnType = {
  status: 'error' | 'warning' | 'success'
  message?: string
  idVerified: boolean
}
