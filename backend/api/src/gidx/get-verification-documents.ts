import { APIError, APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/utils'
import {
  getGIDXStandardParams,
  throwIfIPNotWhitelisted,
} from 'shared/gidx/helpers'
import { GIDXDocument } from 'common/gidx/gidx'
import { TWOMBA_ENABLED } from 'common/envs/constants'
import { getDocumentsStatus } from 'common/gidx/document'

export const getVerificationDocuments: APIHandler<
  'get-verification-documents-gidx'
> = async (_, auth) => {
  if (!TWOMBA_ENABLED) throw new APIError(400, 'GIDX registration is disabled')
  const {
    documents,
    unrejectedUtilityDocuments,
    unrejectedIdDocuments,
    rejectedDocuments,
  } = await getIdentityVerificationDocuments(auth.uid)

  return {
    status: 'success',
    documents,
    utilityDocuments: unrejectedUtilityDocuments,
    idDocuments: unrejectedIdDocuments,
    rejectedDocuments,
  }
}

export const getIdentityVerificationDocuments = async (userId: string) => {
  const ENDPOINT =
    'https://api.gidx-service.in/v3.0/api/DocumentLibrary/CustomerDocuments'
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
  return getDocumentsStatus(documents)
}

type DocumentCheck = {
  ResponseCode: number
  ResponseMessage: string
  MerchantCustomerID: string
  DocumentCount: number
  Documents: GIDXDocument[]
}
