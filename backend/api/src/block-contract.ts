import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { APIHandler } from './helpers/endpoint'

export const blockMarket: APIHandler<'market/:contractId/block'> = async (
  { contractId },
  auth
) => {
  const firestore = admin.firestore()

  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: FieldValue.arrayUnion(contractId),
  })
}

export const unblockMarket: APIHandler<'market/:contractId/unblock'> = async (
  { contractId },
  auth
) => {
  const firestore = admin.firestore()

  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: FieldValue.arrayRemove(contractId),
  })
}
