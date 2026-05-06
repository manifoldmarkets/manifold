import { z } from 'zod'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { authEndpoint } from './helpers/endpoint'

const schema = z
  .object({
    dashboardId: z.string(),
  })
  .strict()

export const followdashboard = authEndpoint(async (req, auth) => {
  const { dashboardId } = schema.parse(req.body)
  const followerId = auth.uid

  const pg = createSupabaseDirectClient()

  const existingFollow = await pg.oneOrNone<{ dashboard_id: string }>(
    `select dashboard_id
     from dashboard_follows
     where dashboard_id = $1 and follower_id = $2`,
    [dashboardId, followerId]
  )

  const isFollowing = !!existingFollow

  if (isFollowing) {
    await pg.none(
      `delete from dashboard_follows
       where dashboard_id = $1 and follower_id = $2`,
      [dashboardId, followerId]
    )
  } else {
    await pg.none(
      `insert into dashboard_follows (dashboard_id, follower_id)
       values ($1, $2)
       on conflict (dashboard_id, follower_id) do nothing`,
      [dashboardId, followerId]
    )
  }

  return { isFollowing: !isFollowing }
})
