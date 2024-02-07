import { APIHandler } from './helpers/endpoint'
import { arrayRemove, arrayUnion } from 'firebase/firestore'
import * as firebase from 'firebase-admin'
import { followUserInternal } from './follow-user'

export const blockUser: APIHandler<'block-user'> = async ({ userId }, auth) => {
  const privateUsers = firestore.collection('private-users')
  await firestore.runTransaction(async (trans) => {
    trans.update(privateUsers.doc(auth.uid), {
      blockedUserIds: arrayUnion(userId),
    })
    trans.update(privateUsers.doc(userId), {
      blockedByUserIds: arrayUnion(auth.uid),
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
      blockedUserIds: arrayRemove(userId),
    })
    trans.update(privateUsers.doc(userId), {
      blockedByUserIds: arrayRemove(auth.uid),
    })
  })
}

const firestore = firebase.firestore()
