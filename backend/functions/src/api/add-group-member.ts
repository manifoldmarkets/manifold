import * as admin from 'firebase-admin'
import { z } from 'zod'

import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group } from 'common/group'
import { User } from 'common/user'
import { GroupMember } from 'common/group-member'
import { APIError, newEndpoint, validate } from './helpers'
import { createAddedToGroupNotification } from '../create-notification'

const bodySchema = z.object({
  groupId: z.string(),
  userId: z.string(),
})

export const addgroupmember = newEndpoint({}, async (req, auth) => {
  const { groupId, userId } = validate(bodySchema, req.body)

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const requesterDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${auth.uid}`
    )
    const groupDoc = firestore.doc(`groups/${groupId}`)
    const requesterUserDoc = firestore.doc(`users/${auth.uid}`)
    const userMemberDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${userId}`
    )

    const [requesterSnap, groupSnap, requesterUserSnap, userMemberSnap] =
      await transaction.getAll(
        requesterDoc,
        groupDoc,
        requesterUserDoc,
        userMemberDoc
      )
    if (!groupSnap.exists) throw new APIError(400, 'Group cannot be found')
    if (userMemberSnap.exists)
      throw new APIError(400, 'User already exists in group!')
    if (!requesterUserSnap.exists)
      throw new APIError(400, 'You cannot be found')

    const requesterUser = requesterUserSnap.data() as User
    const group = groupSnap.data() as Group
    const firebaseUser = await admin.auth().getUser(auth.uid)

    if (userId !== auth.uid) {
      if (!requesterSnap.exists) {
        if (!isManifoldId(auth.uid) && !isAdmin(firebaseUser.email)) {
          throw new APIError(
            400,
            'User does not have permission to add members'
          )
        }
      } else {
        const requester = requesterSnap?.data() as GroupMember
        if (requester.role !== 'admin' && requester.userId !== group.creatorId)
          throw new APIError(
            400,
            'User does not have permission to add members'
          )
      }
    }

    const member = { userId, createdTime: Date.now() }
    firestore
      .collection(`groups/${groupId}/groupMembers`)
      .doc(userId)
      .create(member)

    if (requesterUser && auth.uid != userId) {
      await createAddedToGroupNotification(requesterUser, userId, group)
    }
    return { status: 'success', member }
  })
})

const firestore = admin.firestore()
