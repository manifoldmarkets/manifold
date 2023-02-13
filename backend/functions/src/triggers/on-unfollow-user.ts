import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { FieldValue } from 'firebase-admin/firestore'

export const onUnfollowUser = functions.firestore
  .document('users/{userId}/follows/{followedUserId}')
  .onDelete(async (change, context) => {
    const { followedUserId } = context.params as {
      followedUserId: string
    }

    await firestore.doc(`users/${followedUserId}`).update({
      followerCountCached: FieldValue.increment(-1),
    })
  })

const firestore = admin.firestore()
