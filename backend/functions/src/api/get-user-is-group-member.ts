import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { newEndpoint, validate } from './helpers'
const bodySchema = z.object({
  groupSlug: z.string(),
})

export const getuserisgroupmember = newEndpoint(
  { secrets: ['SUPABASE_PASSWORD'] },
  async (req, auth) => {
    const { groupSlug } = validate(bodySchema, req.body)
    if (!auth.uid) {
      return false
    }
    const pg = createSupabaseDirectClient()
    const userIsMember = await pg.any(
      `select exists(
        select * from group_role
        where group_slug = '${groupSlug}'
        and member_id='${auth.uid}')`
    )
    return userIsMember[0].exists
  }
)
