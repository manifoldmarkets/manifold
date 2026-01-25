import { APIError, APIHandler } from 'api/helpers/endpoint'

// Phone verification is deprecated - identity verification via iDenfy is now used instead
export const requestOTP: APIHandler<'request-otp'> = async () => {
  throw new APIError(
    410,
    'Phone verification is no longer available. Please use identity verification instead.'
  )
}
