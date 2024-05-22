import { toUserAPIResponse } from 'common/api/user-types'
import { convertUser } from 'common/supabase/users'
import { createSupabaseClient } from 'shared/supabase/init'
import { APIError } from './helpers/endpoint'
import { removeUndefinedProps } from 'common/util/object'

export const getUser = async (props: { id: string } | { username: string }) => {
  const db = createSupabaseClient()

  const q = db.from('users').select()

  if ('id' in props) {
    q.eq('id', props.id)
  } else {
    q.eq('username', props.username)
  }

  const { data, error } = await q.single()
  if (error) throw new APIError(404, `Could not find user`)

  return toUserAPIResponse(convertUser(data))
}

export const getDisplayUser = async (
  props: { id: string } | { username: string }
) => {
  const db = createSupabaseClient()

  const q = db
    .from('users')
    .select('id, name, username, data->>avatarUrl, data->>isBannedFromPosting')
  if ('id' in props) {
    q.eq('id', props.id)
  } else {
    q.eq('username', props.username)
  }

  const { data, error } = await q.single()
  if (error) throw new APIError(404, `Could not find user`)
  return removeUndefinedProps({
    ...data,
    isBannedFromPosting: data.isBannedFromPosting === 'true' ? true : undefined,
  })
}
