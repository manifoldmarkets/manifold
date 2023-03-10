import { z } from 'zod'
import { APIError, newEndpoint, validate } from './helpers'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { run } from 'common/supabase/utils'
const bodySchema = z.object({
  groupSlug: z.string(),
})

export const getuserisgroupmember = newEndpoint(
  { memory: '256MiB', secrets: ['API_KEY', 'SUPABASE_PASSWORD'] },
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

    // const db = createSupabaseClient()
    // const { data: userIsMember } = await run(
    //   db
    //     .from('group_role')
    //     .select('*')
    //     .eq('group_slug', groupSlug)
    //     .eq('member_id', auth.uid)
    // )
    // if (error) throw new APIError(400, error.message)

    return userIsMember[0].exists
  }
)
