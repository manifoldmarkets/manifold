import { arrayRemove, arrayUnion } from 'firebase/firestore'
import * as firebase from 'firebase-admin'

import { APIHandler } from './helpers/endpoint'

export const blockGroup: APIHandler<'group/:slug/block'> = async (
  { slug },
  auth
) => {
  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: arrayUnion(slug),
  })
}

export const unblockGroup: APIHandler<'group/:slug/unblock'> = async (
  { slug },
  auth
) => {
  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: arrayRemove(slug),
  })
}

const firestore = firebase.firestore()
