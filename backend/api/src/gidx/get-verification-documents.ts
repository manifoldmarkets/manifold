import { APIError, APIHandler } from 'api/helpers/endpoint'
import { log } from 'shared/utils'
import { getGIDXStandardParams } from 'shared/gidx/helpers'
import { GIDX_REGISTATION_ENABLED, GIDXDocument } from 'common/gidx/gidx'

export const getVerificationDocuments: APIHandler<
  'get-verification-documents-gidx'
> = async (_, auth) => {
  if (!GIDX_REGISTATION_ENABLED)
    throw new APIError(400, 'GIDX registration is disabled')
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
  log(
    'Registration response:',
    data.ResponseMessage,
    'docs',
    data.DocumentCount,
    'userId',
    data.MerchantCustomerID
  )
  const { Documents: documents } = data

  const isRejected = (doc: GIDXDocument) =>
    doc.DocumentStatus === 3 &&
    doc.DocumentNotes.length > 0 &&
    !doc.DocumentNotes.some((n) => n.NoteText == acceptDocText)

  const acceptedDocuments = documents.filter(
    (doc) =>
      doc.DocumentStatus === 3 &&
      doc.DocumentNotes.length > 0 &&
      doc.DocumentNotes.some((n) => n.NoteText == acceptDocText)
  )
  const rejectedDocuments = documents.filter(isRejected)
  const unrejectedUtilityDocuments = documents.filter(
    (doc) =>
      (doc.CategoryType === 7 || doc.CategoryType === 1) && !isRejected(doc)
  )
  const unrejectedIdDocuments = documents.filter(
    (doc) => doc.CategoryType != 7 && doc.CategoryType != 1 && !isRejected(doc)
  )

  return {
    documents,
    rejectedDocuments,
    acceptedDocuments,
    unrejectedUtilityDocuments,
    unrejectedIdDocuments,
  }
}

type DocumentCheck = {
  ResponseCode: number
  ResponseMessage: string
  MerchantCustomerID: string
  DocumentCount: number
  Documents: GIDXDocument[]
}

const acceptDocText = 'Review Complete - Customer Identity Verified'
