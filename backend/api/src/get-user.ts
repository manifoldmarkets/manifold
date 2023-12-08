import type { User } from 'common/user'
import { toLiteUser } from 'common/api/user-types'
import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, typedEndpoint } from './helpers'

export const getUser = typedEndpoint('user', async (props) => {
  const db = createSupabaseClient()

  const q = db.from('users').select('data')

  if ('id' in props) {
    q.eq('id', props.id)
  } else {
    q.eq('username', props.username)
  }

  const { data, error } = await q.single()
  if (error) throw new APIError(404, `Could not find user`)

  return toLiteUser(data.data as unknown as User)
})
