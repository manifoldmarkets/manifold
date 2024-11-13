import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertGroup } from 'common/supabase/groups'
import { APIError } from 'common/api/utils'
import { partition } from 'lodash'

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

  const topics = await pg.manyOrNone(
    `select g.*, gg.bottom_id
    from groups g join group_groups gg
    on g.id = gg.top_id or g.id = gg.bottom_id`,
    [id]
  )

  const [above, below] = partition(topics, (t) => t.id === t.bottom_id)
  return { above: above.map(convertGroup), below: below.map(convertGroup) }
}
