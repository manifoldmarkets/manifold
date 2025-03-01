import { APIError, APIHandler } from 'api/helpers/endpoint'
import { getDocumentsStatus } from 'common/gidx/document'
import { GIDXDocument } from 'common/gidx/gidx'
import {
  getGIDXStandardParams,
  GIDX_BASE_URL,
  throwIfIPNotWhitelisted,
} from 'shared/gidx/helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { assessDocumentStatus } from './get-verification-status'

export const getVerificationDocuments: APIHandler<
  'get-verification-documents-gidx'
> = async (_, auth) => {
  const pg = createSupabaseDirectClient()
  const user = await getUser(auth.uid, pg)
  if (!user) {
    throw new APIError(400, 'User not found')
  }
  const {
    documents,
    unrejectedUtilityDocuments,
    unrejectedIdDocuments,
    rejectedDocuments,
  } = await assessDocumentStatus(user, pg)

  return {
    status: 'success',
    documents,
    utilityDocuments: unrejectedUtilityDocuments,
    idDocuments: unrejectedIdDocuments,
    rejectedDocuments,
  }
}

export const getIdentityVerificationDocuments = async (userId: string) => {
  const ENDPOINT = GIDX_BASE_URL + '/v3.0/api/DocumentLibrary/CustomerDocuments'
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
  throwIfIPNotWhitelisted(data.ResponseCode, data.ResponseMessage)
  log(
    'Registration response:',
    data.ResponseMessage,
    'docs',
    data.DocumentCount,
    'userId',
    data.MerchantCustomerID
  )
  const { Documents: documents } = data
  return getDocumentsStatus(documents ?? [])
}

type DocumentCheck = {
  ResponseCode: number
  ResponseMessage: string
  MerchantCustomerID: string
  DocumentCount: number
  Documents: GIDXDocument[] | null
}
