import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import { authEndpoint } from './helpers/endpoint'
import { insert } from 'shared/supabase/utils'
import {
  deleteFrom,
  from,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'

const schema = z
  .object({
    dashboardId: z.string(),
  })
  .strict()

export const followdashboard = authEndpoint(async (req, auth) => {
  const { dashboardId } = schema.parse(req.body)
  const followerId = auth.uid

  const pg = createSupabaseDirectClient()

  const isFollowing = await pg.oneOrNone(
    renderSql(
      select('1'),
      from('dashboard_follows'),
      where('dashboard_id = $1', dashboardId),
      where('follower_id = $1', followerId)
    )
  )

  if (isFollowing) {
    await pg.none(
      renderSql(
        deleteFrom('dashboard_follows'),
        where('dashboard_id = $1', dashboardId),
        where('follower_id = $1', followerId)
      )
    )
  } else {
    await insert(pg, 'dashboard_follows', {
      dashboard_id: dashboardId,
      follower_id: followerId,
    })
  }

  return { isFollowing: !isFollowing }
})
