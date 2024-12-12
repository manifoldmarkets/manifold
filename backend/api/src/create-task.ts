import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const createTask: APIHandler<'create-task'> = async (props, auth) => {
  const { text, categoryId, priority } = props
  const pg = createSupabaseDirectClient()

  console.log('Creating task', { userId: auth.uid, text, categoryId, priority })

  const result = await pg.one(
    `insert into tasks (creator_id, assignee_id, text, category_id, priority)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [auth.uid, auth.uid, text, categoryId, priority]
  )

  return { id: result.id }
}
