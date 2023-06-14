import * as admin from 'firebase-admin'
import { z } from 'zod'

import { isAdmin, isManifoldId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'
import { createAddedToGroupNotification } from 'shared/create-notification'
import { removeUndefinedProps } from 'common/util/object'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z.object({
  groupId: z.string(),
  userId: z.string(),
  role: z.string().optional(),
})

export const addgroupmember = authEndpoint(async (req, auth) => {
  const { groupId, userId, role } = validate(bodySchema, req.body)
  return addGroupMemberHelper(groupId, userId, auth.uid, role)
})

export async function addGroupMemberHelper(
  groupId: string,
  userId: string,
  myId: string,
  role?: string
) {
  const db = createSupabaseDirectClient()

  // the old firebase code did this as a transaction to prevent race conditions
  // and idk if that's still necessary but I did it here too
  return db.tx(async (tx) => {
    const requester = await tx.oneOrNone(
      `select gm.role, u.data
      from group_members gm join users u
      on gm.member_id = u.id
      where u.id = $1
      and gm.group_id = $2`,
      [myId, groupId]
    )

    const newMemberExists = await tx.oneOrNone(
      'select 1 from group_members where member_id = $1 and group_id = $2',
      [userId, groupId]
    )

    const group = await tx.oneOrNone('select * from groups where id = $1', [
      groupId,
    ])

    if (!group) throw new APIError(400, 'Group cannot be found')
    if (newMemberExists)
      throw new APIError(400, 'User already exists in group!')

    const isAdminRequest = isAdmin((await admin.auth().getUser(myId)).email)

    if (userId === myId) {
      if (group.privacy_status === 'private') {
        throw new APIError(400, 'You can not add yourself to a private group!')
      }
    } else {
      if (!requester) {
        if (!isManifoldId(myId) || !isAdminRequest) {
          throw new APIError(
            400,
            'User does not have permission to add members'
          )
        }
      } else {
        if (requester.role !== 'admin' && myId !== group.creator_id)
          throw new APIError(
            400,
            'User does not have permission to add members'
          )
      }
    }

    const member = removeUndefinedProps({
      member_id: userId,
      group_id: groupId,
      role,
    })
    // insert and return row
    const ret = await tx.one(
      `insert into group_members($1:name) values($1:csv)
      returning *`,
      [member]
    )

    if (requester && myId !== userId) {
      await createAddedToGroupNotification(requester.data, userId, group.data)
    }

    return { status: 'success', member: ret }
  })
}
