import * as functions from 'firebase-functions'

export const onFoldDelete = functions.firestore
  .document('folds/{foldId}')
  .onDelete(async (change, context) => {
    const snapshot = await change.ref.collection('followers').get()

    // Delete followers sub-collection.
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()))
  })
