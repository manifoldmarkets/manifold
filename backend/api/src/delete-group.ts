import { createSupabaseClient } from 'shared/supabase/init'
import { APIError } from './helpers/endpoint'
import { run } from 'common/supabase/utils'
import { log } from 'shared/log'

export const deleteGroup = async (props: { id: string } | { slug: string }) => {
  const db = createSupabaseClient()

  const q = db.from('groups').select('id')
  if ('id' in props) {
    q.eq('id', props.id)
  } else {
    q.eq('slug', props.slug)
  }

  const { data: groups } = await run(q)

  if (groups.length == 0) {
    throw new APIError(404, 'Group not found')
  }

  const id = groups[0].id

  // check if any contracts tagged with this
  const { count: contractCount } = await run(
    db
      .from('contract_groups')
      .select('*', { head: true, count: 'exact' })
      .eq('groupId', id)
  )

  if (contractCount > 0) {
    throw new APIError(
      400,
      `Only topics with no questions can be deleted. There are still ${contractCount} questions tagged with this topic.`
    )
  }

  log('removing group members')
  await db.from('group_members').delete().eq('group_id', id)
  log('deleting group ', id)
  await db.from('groups').delete().eq('id', id)
}
