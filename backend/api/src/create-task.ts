import { log } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const createTask: APIHandler<'create-task'> = async (props, auth) => {
  const {
    text,
    category_id: categoryId,
    priority,
    assignee_id: assigneeId,
  } = props
  const pg = createSupabaseDirectClient()

  log('Creating task', {
    userId: auth.uid,
    text,
    categoryId,
    priority,
    assigneeId,
  })

  const result = await pg.one(
    `insert into tasks (creator_id, assignee_id, text, category_id, priority)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [auth.uid, assigneeId || auth.uid, text, categoryId, priority]
  )

  return result
}
