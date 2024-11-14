import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'

export const getGroupDashboards: APIHandler<'group/:slug/dashboards'> = async ({
  slug,
}) => {
  const pg = createSupabaseDirectClient()

  return await pg.map(
    `select d.id, d.title, d.slug, d.creator_id from dashboards d
    join dashboard_groups dg on d.id = dg.dashboard_id
    join groups g on dg.group_id = g.id
    where g.slug = $1`,
    [slug],
    (row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      creatorId: row.creator_id,
    })
  )
}
