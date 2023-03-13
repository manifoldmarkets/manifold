import * as admin from 'firebase-admin'
import { z } from 'zod'

import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group } from 'common/group'
import { User } from 'common/user'
import { GroupMember } from 'common/group-member'
import { APIError, authEndpoint, validate } from './helpers'
import { createGroupStatusChangeNotification } from 'shared/create-notification'

const bodySchema = z.object({
  groupId: z.string(),
  memberId: z.string(),
  role: z.string(),
})

export const updatememberrole = authEndpoint(async (req, auth) => {
  const { groupId, memberId, role } = validate(bodySchema, req.body)

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const requesterDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${auth.uid}`
    )
    const affectedMemberDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${memberId}`
    )
    const groupDoc = firestore.doc(`groups/${groupId}`)
    const requesterUserDoc = firestore.doc(`users/${auth.uid}`)
    const [requesterSnap, affectedMemberSnap, groupSnap, requesterUserSnap] =
      await transaction.getAll(
        requesterDoc,
        affectedMemberDoc,
        groupDoc,
        requesterUserDoc
      )
    if (!groupSnap.exists) throw new APIError(400, 'Group cannot be found')
    if (!affectedMemberSnap.exists)
      throw new APIError(400, 'Member cannot be found in group')
    if (!requesterUserSnap.exists)
      throw new APIError(400, 'You cannot be found')
    const requesterUser = requesterUserSnap.data() as User
    const affectedMember = affectedMemberSnap.data() as GroupMember
    const group = groupSnap.data() as Group
    const firebaseUser = await admin.auth().getUser(auth.uid)

    if (!requesterSnap.exists) {
      if (!isManifoldId(auth.uid) && !isAdmin(firebaseUser.email)) {
        throw new APIError(400, 'User does not have permission to change roles')
      }
    } else {
      const requester = requesterSnap?.data() as GroupMember
      if (
        requester.role !== 'admin' &&
        requester.userId !== group.creatorId &&
        auth.uid != affectedMember.userId
      )
        throw new APIError(400, 'User does not have permission to change roles')
    }

    if (auth.uid == affectedMember.userId && role !== 'member')
      throw new APIError(400, 'User can only change their role to a lower role')

    if (role == 'member') {
      transaction.update(affectedMemberDoc, {
        role: admin.firestore.FieldValue.delete(),
      })
    } else {
      transaction.update(affectedMemberDoc, { role: role })
    }

    if (requesterUser && auth.uid != memberId) {
      await createGroupStatusChangeNotification(
        requesterUser,
        affectedMember,
        group,
        role
      )
    }
    return affectedMember
  })
})

const firestore = admin.firestore()
