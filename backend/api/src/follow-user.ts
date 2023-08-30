import { z } from 'zod'
import { authEndpoint } from './helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { run } from 'common/supabase/utils'

const schema = z.object({
  userId: z.string().describe('id of the person you want to follow'),
  follow: z.boolean().describe('Whether you want to follow or unfollow'),
})

export const followUser = authEndpoint(async (req, auth) => {
  const { userId: them, follow } = schema.parse(req.body)
  const me = auth.uid

  const db = createSupabaseClient()

  const query = follow
    ? db.from('user_follows').upsert([{ user_id: me, follow_id: them }])
    : db.from('user_follows').delete().eq('user_id', me).eq('follow_id', them)

  await run(query)

  return { success: true }
})
