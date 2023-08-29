import * as admin from 'firebase-admin'
import { z } from 'zod'

import { isAdminId } from 'common/envs/constants'
import { APIError, authEndpoint, validate } from './helpers'
import { createGroupStatusChangeNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'

const bodySchema = z.object({
  groupId: z.string(),
  memberId: z.string(),
  role: z.enum(['admin', 'member', 'moderator']),
})

export const updatememberrole = authEndpoint(async (req, auth) => {
  const { groupId, memberId, role } = validate(bodySchema, req.body)

  const db = createSupabaseDirectClient()

  return db.tx(async (tx) => {
    const requesterMembership = await tx.oneOrNone(
      'select * from group_members where member_id = $1 and group_id = $2',
      [auth.uid, groupId]
    )
    const affectedMember = await tx.oneOrNone(
      'select * from group_members where member_id = $1 and group_id = $2',
      [memberId, groupId]
    )

    const group = await tx.oneOrNone('select * from groups where id = $1', [
      groupId,
    ])

    const requesterUser = await tx.oneOrNone(
      `select data from users where id = $1`,
      [auth.uid]
    )

    if (!group) throw new APIError(404, 'Group cannot be found')
    if (!affectedMember)
      throw new APIError(404, 'Member cannot be found in group')
    if (!requesterUser) throw new APIError(401, 'Your account was not found')

    const isAdminRequest = isAdminId(auth.uid)

    if (!requesterMembership) {
      if (!isAdminRequest) {
        throw new APIError(403, 'User does not have permission to change roles')
      }
    } else {
      if (
        requesterMembership.role !== 'admin' &&
        auth.uid !== affectedMember.member_id
      )
        throw new APIError(403, 'User does not have permission to change roles')
    }

    if (auth.uid === affectedMember.member_id && role !== 'member')
      throw new APIError(403, 'You can only change your role to a lower role')

    const ret = await tx.one(
      `update group_members
       set role = $1 where member_id = $2 and group_id = $3
       returning *`,
      [role, memberId, groupId]
    )

    if (requesterUser && auth.uid != memberId) {
      await createGroupStatusChangeNotification(
        requesterUser,
        affectedMember,
        group.data,
        role
      )
    }

    return { status: 'success', member: ret }
  })
})
