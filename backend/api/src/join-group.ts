import * as admin from 'firebase-admin'
import { z } from 'zod'

import { Group } from 'common/group'
import { APIError, AuthedUser, authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  groupId: z.string(),
})

export const joingroup = authEndpoint(async (req, auth) => {
  const { groupId } = validate(bodySchema, req.body)
  // run as transaction to prevent race conditions
  const member = await joinGroupHelper(groupId, false, auth)

  return { status: 'success', member }
})

const firestore = admin.firestore()

export async function joinGroupHelper(
  groupId: string,
  isPrivate: boolean,
  auth: AuthedUser
) {
  return await firestore.runTransaction(async (transaction) => {
    const groupDoc = firestore.doc(`groups/${groupId}`)
    const userMemberDoc = firestore.doc(
      `groups/${groupId}/groupMembers/${auth.uid}`
    )

    const [groupSnap, userMemberSnap] = await transaction.getAll(
      groupDoc,
      userMemberDoc
    )
    if (!groupSnap.exists) throw new APIError(400, 'Group cannot be found')
    if (userMemberSnap.exists)
      throw new APIError(400, 'You are already a group member!')

    const group = groupSnap.data() as Group

    if (!isPrivate && group.privacyStatus === 'private') {
      throw new APIError(400, 'You can not add yourself to a private group!')
    }

    const member = {
      userId: auth.uid,
      createdTime: Date.now(),
    }

    firestore
      .collection(`groups/${groupId}/groupMembers`)
      .doc(auth.uid)
      .create(member)

    return member
  })
}
