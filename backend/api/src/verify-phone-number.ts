import { APIError, APIHandler } from 'api/helpers/endpoint'

// Phone verification is deprecated - identity verification via iDenfy is now used instead
export const verifyPhoneNumber: APIHandler<'verify-phone-number'> = async () => {
  throw new APIError(
    403,
    'Phone verification is no longer available. Please use identity verification instead.'
  )
}
