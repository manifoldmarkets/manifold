import * as admin from 'firebase-admin'
import { z } from 'zod'

import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group } from 'common/group'
import { GroupMember } from 'common/group-member'
import { APIError, authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  groupId: z.string(),
  privacy: z.string(),
})

export const updategroupprivacy = authEndpoint(async (req, auth) => {
  const { groupId, privacy } = validate(bodySchema, req.body)

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const requesterDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${auth.uid}`
    )
    const groupDoc = firestore.doc(`groups/${groupId}`)
    const requesterUserDoc = firestore.doc(`users/${auth.uid}`)
    const [requesterSnap, groupSnap, requesterUserSnap] =
      await transaction.getAll(requesterDoc, groupDoc, requesterUserDoc)
    if (!groupSnap.exists) throw new APIError(400, 'Group cannot be found')
    if (!requesterSnap.exists)
      throw new APIError(400, 'You cannot be found in group')
    if (!requesterUserSnap.exists)
      throw new APIError(400, 'You cannot be found')

    const requester = requesterSnap.data() as GroupMember
    const group = groupSnap.data() as Group
    const firebaseUser = await admin.auth().getUser(auth.uid)

    if (
      requester.role !== 'admin' &&
      requester.userId !== group.creatorId &&
      !isManifoldId(auth.uid) &&
      !isAdmin(firebaseUser.email)
    )
      throw new APIError(
        400,
        'User does not have permission to change group privacy'
      )

    if (group.privacyStatus == 'private')
      throw new APIError(
        400,
        'You can not change the privacy of a private group'
      )

    if (privacy == 'private') {
      throw new APIError(400, 'You can not retroactively make a group private')
    }

    if (privacy == group.privacyStatus) {
      throw new APIError(400, 'Group privacy is already set to this!')
    }

    if (
      (privacy == 'curated' && group.privacyStatus == 'public') ||
      (privacy == 'public' && group.privacyStatus == 'curated')
    ) {
      transaction.update(groupDoc, { privacyStatus: privacy })
    } else {
      throw new APIError(400, 'This privacy change is not allowed')
    }

    return group
  })
})

const firestore = admin.firestore()
