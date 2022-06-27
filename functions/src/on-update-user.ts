import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { User } from '../../common/user'
const firestore = admin.firestore()

export const onUpdateGroup = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change) => {
    const prevUser = change.before.data() as User
    const user = change.after.data() as User

    // if they're updating their referredId, send the

    await firestore
      .collection('groups')
      .doc(group.id)
      .update({ mostRecentActivityTime: Date.now() })
  })
