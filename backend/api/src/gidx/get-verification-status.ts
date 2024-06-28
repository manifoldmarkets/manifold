import { APIError, APIHandler } from 'api/helpers/endpoint'
import {
  getGIDXCustomerProfile,
  getUserRegistrationRequirements,
} from 'shared/gidx/helpers'
import { GIDX_REGISTATION_ENABLED, GIDXCustomerProfile } from 'common/gidx/gidx'
import { processUserReasonCodes } from 'api/gidx/register'
import { getIdentityVerificationDocuments } from 'api/gidx/get-verification-documents'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getVerificationStatus: APIHandler<
  'get-verification-status-gidx'
> = async (_, auth) => {
  if (!GIDX_REGISTATION_ENABLED)
    throw new APIError(400, 'GIDX registration is disabled')
  const customerProfile = await getGIDXCustomerProfile(auth.uid)
  return await getVerificationStatusInternal(auth.uid, customerProfile)
}

export const getVerificationStatusInternal = async (
  userId: string,
  customerProfile: GIDXCustomerProfile
) => {
  await getUserRegistrationRequirements(userId)
  const {
    ReasonCodes,
    ResponseMessage,
    ResponseCode,
    FraudConfidenceScore,
    IdentityConfidenceScore,
  } = customerProfile
  if (ResponseCode === 501 && ResponseMessage.includes('not found')) {
    const pg = createSupabaseDirectClient()
    // TODO: broadcast this user update when we have that functionality
    await pg.none(`update users set data = data - 'kycStatus' where id = $1`, [
      userId,
    ])
    return {
      status: 'error',
      message: 'User not found in GIDX',
    }
  }
  const { status, message } = await processUserReasonCodes(
    userId,
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore,
    true
  )
  if (status === 'error') {
    return {
      status: 'error',
      message,
    }
  }
  const { documents } = await getIdentityVerificationDocuments(userId)

  return {
    status: 'success',
    documents,
  }
}
