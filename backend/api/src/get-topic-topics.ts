import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertGroup } from 'common/supabase/groups'
import { APIError } from 'common/api/utils'

export const getTopicTopics = async (
  props: { slug: string } | { id: string }
) => {
  const pg = createSupabaseDirectClient()

  let id
  if ('id' in props) {
    id = props.id
  } else {
    const group = await pg.oneOrNone(`select id from groups where slug = $1`, [
      props.slug,
    ])
    if (!group) throw new APIError(404, 'Group not found')
    id = group.id
  }

  const [above, below] = await pg.multi(
    `select id, slug, name, importance_score, privacy_status, total_members
    from groups g join group_groups gg
    on g.id = gg.top_id where gg.bottom_id = $1
    order by importance_score desc;
    select id, slug, name, importance_score, privacy_status, total_members
    from groups g join group_groups gg
    on g.id = gg.bottom_id where gg.top_id = $1
    order by importance_score desc`,
    [id]
  )

  return {
    above: above.map(convertGroup),
    below: below.map(convertGroup),
  }
}
