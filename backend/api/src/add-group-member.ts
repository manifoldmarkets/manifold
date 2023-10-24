import * as admin from 'firebase-admin'
import { z } from 'zod'

import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'
import { createAddedToGroupNotification } from 'shared/create-notification'
import { removeUndefinedProps } from 'common/util/object'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getPrivateUser } from 'shared/utils'
import { FieldValue } from 'firebase-admin/firestore'

const bodySchema = z.object({
  groupId: z.string(),
  userId: z.string(),
  role: z.string().optional(),
})

export const addgroupmember = authEndpoint(async (req, auth) => {
  const { groupId, userId, role } = validate(bodySchema, req.body)
  return addUserToGroup(groupId, userId, auth.uid, role)
})

export async function addUserToGroup(
  groupId: string,
  userId: string,
  myId: string,
  role?: string,
  isLink = false
) {
  const pg = createSupabaseDirectClient()

  // the old firebase code did this as a transaction to prevent race conditions
  // and idk if that's still necessary but I did it here too
  return pg.tx(async (tx) => {
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

    if (!group) throw new APIError(404, 'Group cannot be found')
    if (newMemberExists)
      throw new APIError(403, 'User already exists in group!')

    const privateUser = await getPrivateUser(userId)
    if (privateUser && privateUser.blockedGroupSlugs.includes(group.slug)) {
      const firestore = admin.firestore()
      await firestore.doc(`private-users/${userId}`).update({
        blockedGroupSlugs: FieldValue.arrayRemove(group.slug),
      })
    }

    const isAdminRequest = isAdminId(myId)

    if (userId === myId) {
      if (group.privacy_status === 'private' && !isLink) {
        throw new APIError(403, 'You can not add yourself to a private group!')
      }
    } else {
      if (!requester) {
        if (!isAdminRequest) {
          throw new APIError(
            403,
            'User does not have permission to add members'
          )
        }
      } else {
        if (requester.role !== 'admin')
          throw new APIError(
            403,
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
