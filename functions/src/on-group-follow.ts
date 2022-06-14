import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

const firestore = admin.firestore()

export const onGroupFollow = functions.firestore
  .document('groups/{groupId}/followers/{userId}')
  .onWrite(async (change, context) => {
    const { groupId } = context.params

    const snapshot = await firestore
      .collection(`groups/${groupId}/followers`)
      .get()
    const followCount = snapshot.size

    await firestore.doc(`groups/${groupId}`).update({ followCount })
  })
