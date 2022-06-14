import * as functions from 'firebase-functions'

export const onGroupDelete = functions.firestore
  .document('groups/{groupId}')
  .onDelete(async (change, _context) => {
    const snapshot = await change.ref.collection('followers').get()

    // Delete followers sub-collection.
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()))
  })
