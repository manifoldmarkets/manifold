import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, typedEndpoint } from './helpers'
import { convertGroup } from 'common/supabase/groups'

export const getGroup = typedEndpoint('group', async (props) => {
  const db = createSupabaseClient()
  const q = db.from('groups').select()
  if ('id' in props) {
    q.eq('id', props.id)
  } else {
    q.eq('slug', props.slug)
  }

  const { data, error } = await q.single()
  if (error) throw new APIError(404, 'Group not found')

  return convertGroup(data)
})
