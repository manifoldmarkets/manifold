import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const firestore = admin.firestore()

export const onFoldFollow = functions.firestore
  .document('folds/{foldId}/followers/{userId}')
  .onWrite(async (change, context) => {
    const { foldId } = context.params

    const snapshot = await firestore
      .collection(`folds/${foldId}/followers`)
      .get()
    const followCount = snapshot.size

    await firestore.doc(`folds/${foldId}`).update({ followCount })
  })
