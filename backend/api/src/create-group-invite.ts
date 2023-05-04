import * as admin from 'firebase-admin'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'
import { runTxn } from 'shared/run-txn'
import { MarketAdCreateTxn } from 'common/txn'
import { getGroup, log } from 'shared/utils'

const schema = z.object({
  groupId: z.string(),
  maxUses: z.number().optional(),
  duration: z.string().optional(),
})

export const creategroupinvite = authEndpoint(async (req, auth) => {
  const { groupId, maxUses, duration } = validate(schema, req.body)

  log('creating group invite')
  const pg = createSupabaseDirectClient()

  const { data: group } = await pg.oneOrNone(
    `select data from groups where id = $1`,
    [groupId]
  )

  if (!group) {
    throw new APIError(404, 'Group not found')
  }

  if (group.privacyStatus != 'private') {
    throw new APIError(
      403,
      'This group is not private (so why would you need this)'
    )
  }

  const { is_group_admin } = await pg.one(`select is_group_admin($1, $2)`, [
    groupId,
    auth.uid,
  ])

  if (!is_group_admin) {
    throw new APIError(
      403,
      'You do not have permission to create invites for this group'
    )
  }

  const { data } = await pg.oneOrNone(`SELECT get_last_week_long_link($1)`, [
    groupId,
  ])

  console.log(data)
  if (!data) {
    // create if not exists the group invite link row
    const { id } = await pg.one(
      `insert into group_invites(group_id, max_uses, duration, is_forever)
      values ($1, $2, $3, $4)
      returning id`,
      [groupId, maxUses ? maxUses : null, duration ? duration : null, !duration]
    )

    // return something
    return id
  } else {
    return 'hi'
  }
})
