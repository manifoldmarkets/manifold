import { z } from 'zod'
import { APIError, authEndpoint } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createFollowOrMarketSubsidizedNotification } from 'shared/create-notification'
import { log } from 'shared/utils'
import { upsert } from 'shared/supabase/utils'
import {
  renderSql,
  from,
  select,
  where,
  deleteFrom,
} from 'shared/supabase/sql-builder'

const schema = z
  .object({
    userId: z.string().describe('id of the person you want to follow'),
    follow: z.boolean().describe('Whether you want to follow or unfollow'),
  })
  .strict()

export const followUser = authEndpoint(async (req, auth) => {
  const { userId: them, follow } = schema.parse(req.body)
  const me = auth.uid

  await followUserInternal(me, them, follow)
  return { success: true }
})

export const followUserInternal = async (
  me: string,
  them: string,
  follow: boolean
) => {
  if (me === them) throw new APIError(400, 'You cannot follow yourself')

  const pg = createSupabaseDirectClient()

  if (follow) {
    await upsert(pg, 'user_follows', ['user_id', 'follow_id'], {
      user_id: me,
      follow_id: them,
    })
  } else {
    await pg.none(
      renderSql(
        deleteFrom('user_follows'),
        where('user_id = $1', me),
        where('follow_id = $1', them)
      )
    )
  }

  // send notification
  if (follow) {
    try {
      const today = new Date()

      const user = await pg.oneOrNone(
        renderSql(
          from('users'),
          select(`name, username, data->>'avatarUrl' as avatarUrl`),
          where(`id = $1`, me)
        )
      )

      if (!user) throw new APIError(404, 'User not found')

      await createFollowOrMarketSubsidizedNotification(
        me,
        'follow',
        'created',
        user as any,
        `${me}-${today.toDateString()}-follow`,
        '',
        { recipients: [them] }
      )
    } catch (error) {
      log('failed to send notification:', { error })
    }
  }

  return { success: true }
}
