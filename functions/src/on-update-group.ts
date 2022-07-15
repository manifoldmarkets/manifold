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

    if (prevGroup.contractIds.length < group.contractIds.length) {
      await firestore
        .collection('groups')
        .doc(group.id)
        .update({ mostRecentContractAddedTime: Date.now() })
      //TODO: create notification with isSeeOnHref set to the group's /group/slug/questions url
      // but first, let the new /group/slug/chat notification permeate so that we can differentiate between the two
    }

    await firestore
      .collection('groups')
      .doc(group.id)
      .update({ mostRecentActivityTime: Date.now() })
  })
