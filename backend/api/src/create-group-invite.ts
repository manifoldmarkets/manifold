import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers'

const durationOptions = ['1 hour', '1 week', '1 month', '1 year']

const schema = z.object({
  groupId: z.string(),
  maxUses: z.number().optional(),
  duration: z
    .string()
    .optional()
    .refine((value) => value === undefined || durationOptions.includes(value), {
      message: 'Duration must be one of: 1 hour, 1 week, 1 month, 1 year',
    }),
}).strict()

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

  // if user just wants to generate a default link, look to see if there's already an existing one
  if (!maxUses && duration == '1 week') {
    const { get_last_week_long_link } = await pg.oneOrNone(
      `SELECT get_last_week_long_link($1)`,
      [groupId]
    )
    if (get_last_week_long_link) {
      return { inviteSlug: get_last_week_long_link }
    }
  }

  // create if not exists the group invite link row
  const { id } = await pg.one(
    `insert into group_invites(group_id, max_uses, duration)
      values ($1, $2, $3)
      returning id`,
    [groupId, maxUses ? maxUses : null, duration ? duration : null]
  )

  // return something
  return { inviteSlug: id }
})
