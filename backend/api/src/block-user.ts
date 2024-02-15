import { APIHandler } from './helpers/endpoint'
import { FieldValue } from 'firebase-admin/firestore'
import * as firebase from 'firebase-admin'
import { followUserInternal } from './follow-user'

export const blockUser: APIHandler<'block-user'> = async ({ userId }, auth) => {
  const privateUsers = firestore.collection('private-users')
  await firestore.runTransaction(async (trans) => {
    trans.update(privateUsers.doc(auth.uid), {
      blockedUserIds: FieldValue.arrayUnion(userId),
    })
    trans.update(privateUsers.doc(userId), {
      blockedByUserIds: FieldValue.arrayUnion(auth.uid),
    })
  })

  await followUserInternal(auth.uid, userId, false)
}

export const unblockUser: APIHandler<'unblock-user'> = async (
  { userId },
  auth
) => {
  const privateUsers = firestore.collection('private-users')

  await firestore.runTransaction(async (trans) => {
    trans.update(privateUsers.doc(auth.uid), {
      blockedUserIds: FieldValue.arrayRemove(userId),
    })
    trans.update(privateUsers.doc(userId), {
      blockedByUserIds: FieldValue.arrayRemove(auth.uid),
    })
  })
}

const firestore = firebase.firestore()
