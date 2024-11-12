import { createSupabaseDirectClient } from 'shared/supabase/init'
import { update, updateData } from 'shared/supabase/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { GroupAboutSchema, GroupNameSchema } from 'common/group'
import { log } from 'shared/utils'
import { removeUndefinedProps } from 'common/util/object'

const schema = z
  .object({
    id: z.string(),
    about: GroupAboutSchema.optional(),
    name: GroupNameSchema.optional(),
    bannerUrl: z.string().optional(),
  })
  .strict()

export const updategroup = authEndpoint(async (req, auth) => {
  const data = validate(schema, req.body)
  const pg = createSupabaseDirectClient()

  if (!isModId(auth.uid) && !isAdminId(auth.uid)) {
    const requester = await pg.oneOrNone(
      'select role from group_members where group_id = $1 and member_id = $2',
      [data.id, auth.uid]
    )

    if (requester?.role !== 'admin') {
      throw new APIError(403, 'You do not have permission to update this group')
    }
  }

  if (data.name) {
    const existingName = await pg.oneOrNone(
      `select 1 from groups where name = $1`,
      [data.name]
    )
    if (existingName) {
      throw new APIError(400, `The group ${data.name} already exists`)
    }
  }

  log(
    `update group initiated by ${auth.uid}: `,
    Object.entries(data).flat().join(' ')
  )

  // TODO: can't remove banner
  await update(
    pg,
    'groups',
    'id',
    removeUndefinedProps({
      id: data.id,
      name: data.name,
      about: data.about,
      banner_url: data.bannerUrl,
    })
  )

  return { status: 'success' }
})
