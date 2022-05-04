import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { View } from '../../common/tracking'

const firestore = admin.firestore()

export const onView = functions.firestore
  .document('private-users/{userId}/views/{viewId}')
  .onCreate(async (snapshot, context) => {
    const { userId } = context.params

    const { contractId, timestamp } = snapshot.data() as View

    await firestore
      .doc(`private-users/${userId}/cache/viewCounts`)
      .set(
        { [contractId]: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      )

    await firestore
      .doc(`private-users/${userId}/cache/lastViewTime`)
      .set({ [contractId]: timestamp }, { merge: true })
  })
