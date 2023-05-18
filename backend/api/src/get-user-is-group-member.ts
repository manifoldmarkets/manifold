import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { authEndpoint, validate } from './helpers'

const bodySchema = z.object({
  groupSlug: z.string(),
}).strict()

export const getuserisgroupmember = authEndpoint(async (req, auth) => {
  const { groupSlug } = validate(bodySchema, req.body)
  if (!auth.uid) {
    return { isGroupMember: false }
  }
  const pg = createSupabaseDirectClient()
  const userIsMember = await pg.one(
    `select exists(
        select * from group_role
        where group_slug = '${groupSlug}'
        and member_id='${auth.uid}')`
  )
  return { isGroupMember: userIsMember.exists }
})
