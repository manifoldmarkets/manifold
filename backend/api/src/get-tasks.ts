import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getTasks: APIHandler<'get-tasks'> = async (_, auth) => {
  const pg = createSupabaseDirectClient()

  console.log('Getting tasks for user', auth.uid)

  const tasks = await pg.manyOrNone(
    `select *
     from tasks
     where creator_id = $1 or assignee_id = $1
     order by priority, created_time desc`,
    [auth.uid]
  )

  return { tasks }
}
