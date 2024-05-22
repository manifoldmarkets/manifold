import { FieldValue } from 'firebase-admin/firestore'
import * as firebase from 'firebase-admin'

import { APIHandler } from './helpers/endpoint'

export const blockGroup: APIHandler<'group/:slug/block'> = async (
  { slug },
  auth
) => {
  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: FieldValue.arrayUnion(slug),
  })
}

export const unblockGroup: APIHandler<'group/:slug/unblock'> = async (
  { slug },
  auth
) => {
  await firestore.doc(`private-users/${auth.uid}`).update({
    blockedGroupSlugs: FieldValue.arrayRemove(slug),
  })
}

const firestore = firebase.firestore()
