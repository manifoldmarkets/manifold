import { arrayRemove, arrayUnion } from 'firebase/firestore'
import * as firebase from 'firebase-admin'

import { APIHandler } from './helpers/endpoint'

export const blockMarket: APIHandler<'market/:contractId/block'> = async (
  { contractId },
  auth
) => {
  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: arrayUnion(contractId),
  })
}

export const unblockMarket: APIHandler<'market/:contractId/unblock'> = async (
  { contractId },
  auth
) => {
  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: arrayRemove(contractId),
  })
}

const firestore = firebase.firestore()
