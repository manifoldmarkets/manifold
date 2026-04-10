/**
 * @fileoverview DEPRECATED - GIDX document verification helpers
 *
 * This module is being replaced by idenfy for identity verification.
 * Document uploads are now handled through idenfy's verification flow.
 */

import {
  GIDX_REGISTATION_DOCUMENTS_REQUIRED,
  GIDXDocument,
} from 'common/gidx/gidx'
const acceptDocText = 'Review Complete - Customer Identity Verified'

export const getDocumentsStatus = (documents: GIDXDocument[]) => {
  const docRejected = (doc: GIDXDocument) =>
    doc.DocumentStatus === 3 &&
    doc.DocumentNotes.length > 0 &&
    !doc.DocumentNotes.some((n) => n.NoteText == acceptDocText)

  // There is a slight weirdness here: if a doc is accepted, but then later rejected, this
  // won't handle that case. It will think it's still accepted.
  const acceptedDocuments = documents.filter(
    (doc) =>
      doc.DocumentStatus === 3 &&
      doc.DocumentNotes.length > 0 &&
      doc.DocumentNotes.some((n) => n.NoteText == acceptDocText)
  )
  const rejectedDocuments = documents.filter(docRejected)
  const unrejectedUtilityDocuments = documents.filter(
    (doc) =>
      (doc.CategoryType === 7 || doc.CategoryType === 1) && !docRejected(doc)
  )
  const unrejectedIdDocuments = documents.filter(
    (doc) => doc.CategoryType != 7 && doc.CategoryType != 1 && !docRejected(doc)
  )

  const acceptedUtilityDocuments = unrejectedUtilityDocuments.filter(
    (doc) => doc.DocumentStatus === 3
  )
  const acceptedIdDocuments = unrejectedIdDocuments.filter(
    (doc) => doc.DocumentStatus === 3
  )
  const pendingDocuments = documents.filter((doc) => doc.DocumentStatus !== 3)

  const requiresMultipleDocuments = GIDX_REGISTATION_DOCUMENTS_REQUIRED > 1

  const isVerified =
    acceptedDocuments.length >= GIDX_REGISTATION_DOCUMENTS_REQUIRED &&
    (requiresMultipleDocuments
      ? acceptedUtilityDocuments.length > 0 && acceptedIdDocuments.length > 0
      : acceptedIdDocuments.length > 0)

  const isPending =
    !isVerified &&
    acceptedDocuments.length + pendingDocuments.length >=
      GIDX_REGISTATION_DOCUMENTS_REQUIRED &&
    (requiresMultipleDocuments
      ? unrejectedUtilityDocuments.length > 0 &&
        unrejectedIdDocuments.length > 0
      : unrejectedIdDocuments.length > 0)

  const isRejected =
    !isVerified &&
    !isPending &&
    (rejectedDocuments.length > 0 ||
      acceptedDocuments.length < GIDX_REGISTATION_DOCUMENTS_REQUIRED)

  return {
    documents,
    rejectedDocuments,
    unrejectedUtilityDocuments,
    unrejectedIdDocuments,
    isPending,
    isVerified,
    isRejected,
  }
}
