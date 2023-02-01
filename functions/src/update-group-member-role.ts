import * as admin from 'firebase-admin'
import { z } from 'zod'

import { isAdmin, isManifoldId } from 'common/envs/constants'
import { Group } from 'common/group'
import { GroupMember } from '../../common/group-member'
import { APIError, newEndpoint, validate } from './api'

const bodySchema = z.object({
  groupId: z.string(),
  memberId: z.string(),
  role: z.string(),
})

export const updatememberrole = newEndpoint({}, async (req, auth) => {
  const { groupId, memberId, role } = validate(bodySchema, req.body)
  console.log('HIII')

  // run as transaction to prevent race conditions
  return await firestore.runTransaction(async (transaction) => {
    const requesterDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${auth.uid}`
    )
    const affectedMemberDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${memberId}`
    )
    const groupDoc = firestore.doc(`groups/${groupId}`)
    const [requesterSnap, affectedMemberSnap, groupSnap] =
      await transaction.getAll(requesterDoc, affectedMemberDoc, groupDoc)
    if (!groupSnap.exists) throw new APIError(400, 'Group cannot be found')
    if (!requesterSnap.exists)
      throw new APIError(400, 'You cannot be found in group')
    if (!affectedMemberSnap.exists)
      throw new APIError(400, 'Member cannot be found in group')

    const requester = requesterSnap.data() as GroupMember
    const affectedMember = affectedMemberSnap.data() as GroupMember
    const group = groupSnap.data() as Group
    const firebaseUser = await admin.auth().getUser(auth.uid)

    if (
      requester.role !== 'admin' &&
      requester.userId !== group.creatorId &&
      !isManifoldId(auth.uid) &&
      !isAdmin(firebaseUser.email) &&
      auth.uid != affectedMember.userId
    )
      throw new APIError(400, 'User does not have permission to change roles')

    if (auth.uid == affectedMember.userId && role !== 'member')
      throw new APIError(400, 'User can only change their role to a lower role')

    if (role == 'member') {
      transaction.update(affectedMemberDoc, {
        role: admin.firestore.FieldValue.delete(),
      })
    } else {
      transaction.update(affectedMemberDoc, { role: role })
    }
    return affectedMember
  })
})

const firestore = admin.firestore()
