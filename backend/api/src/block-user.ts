import { APIHandler } from './helpers/endpoint'
import { FieldValue } from 'firebase-admin/firestore'
import * as firebase from 'firebase-admin'
import { followUserInternal } from './follow-user'

export const blockUser: APIHandler<'user/by-id/:id/block'> = async (
  { id },
  auth
) => {
  const privateUsers = firestore.collection('private-users')
  await firestore.runTransaction(async (trans) => {
    trans.update(privateUsers.doc(auth.uid), {
      blockedUserIds: FieldValue.arrayUnion(id),
    })
    trans.update(privateUsers.doc(id), {
      blockedByUserIds: FieldValue.arrayUnion(auth.uid),
    })
  })

  await followUserInternal(auth.uid, id, false)
}

export const unblockUser: APIHandler<'user/by-id/:id/unblock'> = async (
  { id },
  auth
) => {
  const privateUsers = firestore.collection('private-users')

  await firestore.runTransaction(async (trans) => {
    trans.update(privateUsers.doc(auth.uid), {
      blockedUserIds: FieldValue.arrayRemove(id),
    })
    trans.update(privateUsers.doc(id), {
      blockedByUserIds: FieldValue.arrayRemove(auth.uid),
    })
  })
}

const firestore = firebase.firestore()
