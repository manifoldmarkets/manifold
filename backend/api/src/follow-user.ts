import { z } from 'zod'
import { authEndpoint } from './helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { run } from 'common/supabase/utils'
import { createFollowOrMarketSubsidizedNotification } from 'shared/create-notification'
import { log } from 'shared/utils'

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

  // send notification
  if (follow) {
    try {
      const today = new Date()

      const user = await db
        .from('users')
        .select(
          'name, username, data->avatarUrl' as 'name, username, avatarUrl'
        )
        .eq('id', me)
        .single()

      log('user:', user)
      if (user.error) throw user.error

      await createFollowOrMarketSubsidizedNotification(
        me,
        'follow',
        'created',
        user.data as any,
        `${me}-${today.toDateString()}-follow`,
        '',
        { recipients: [them] }
      )
    } catch (error) {
      log('failed to send notification:', error)
    }
  }

  return { success: true }
})
