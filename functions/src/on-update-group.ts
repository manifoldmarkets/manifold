import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Group } from '../../common/group'
const firestore = admin.firestore()

export const onUpdateGroup = functions.firestore
  .document('groups/{groupId}')
  .onUpdate(async (change) => {
    const prevGroup = change.before.data() as Group
    const group = change.after.data() as Group

    // ignore the update we just made
    if (prevGroup.mostRecentActivityTime !== group.mostRecentActivityTime)
      return

    await firestore
      .collection('groups')
      .doc(group.id)
      .update({ mostRecentActivityTime: new Date().getTime() })
  })
