import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getPrivateUserSupabase, log } from 'shared/utils'
import { getPhoneNumber } from 'shared/helpers/get-phone-number'
import {
  getGIDXCustomerProfile,
  getGIDXStandardParams,
} from 'shared/gidx/helpers'
import {
  GIDX_DOCUMENTS_REQUIRED,
  GIDX_REGISTATION_ENABLED,
  GIDXCustomerProfile,
  GIDXDocument,
} from 'common/gidx/gidx'
import { updateUser } from 'shared/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { processUserReasonCodes } from 'api/gidx/register'
const ENDPOINT =
  'https://api.gidx-service.in/v3.0/api/DocumentLibrary/CustomerDocuments'

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
  const user = await getPrivateUserSupabase(userId)
  if (!user) {
    throw new APIError(404, 'Private user not found')
  }
  if (!user.email) {
    throw new APIError(400, 'User must have an email address')
  }
  const phoneNumberWithCode = await getPhoneNumber(userId)
  if (!phoneNumberWithCode) {
    throw new APIError(400, 'User must have a phone number')
  }
  const { ReasonCodes, FraudConfidenceScore, IdentityConfidenceScore } =
    customerProfile
  const { status, message } = await processUserReasonCodes(
    userId,
    ReasonCodes,
    FraudConfidenceScore,
    IdentityConfidenceScore
  )
  if (status === 'error') {
    return {
      status: 'error',
      message,
    }
  }
  const body = {
    MerchantCustomerID: userId,
    ...getGIDXStandardParams(),
  } as Record<string, string>
  const queryParams = new URLSearchParams(body).toString()
  const urlWithParams = `${ENDPOINT}?${queryParams}`

  const res = await fetch(urlWithParams)
  if (!res.ok) {
    throw new APIError(400, 'GIDX verification session failed')
  }

  const data = (await res.json()) as DocumentCheck
  log(
    'Registration response:',
    data.ResponseMessage,
    'docs',
    data.DocumentCount,
    'userId',
    data.MerchantCustomerID
  )
  const { Documents: documents } = data

  const pg = createSupabaseDirectClient()

  if (
    documents.filter(
      (doc) => doc.DocumentStatus === 3 && doc.DocumentNotes.length === 0
    ).length >= GIDX_DOCUMENTS_REQUIRED
  ) {
    await updateUser(pg, userId, {
      kycStatus: 'verified',
    })
  } else if (
    documents.filter(
      (doc) => doc.DocumentStatus === 3 && doc.DocumentNotes.length > 0
    ).length > 0
  ) {
    await updateUser(pg, userId, {
      kycStatus: 'await-more-documents',
    })
  }

  return {
    status: 'success',
    documents,
  }
}

type DocumentCheck = {
  ResponseCode: number
  ResponseMessage: string
  MerchantCustomerID: string
  DocumentCount: number
  Documents: GIDXDocument[]
}
