import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getCategories: APIHandler<'get-categories'> = async (_, auth) => {
  const pg = createSupabaseDirectClient()

  console.log('Getting categories for user', auth.uid)

  const categories = await pg.manyOrNone(
    `select c.*
     from categories c
     left join tasks t on c.id = t.category_id
     where c.user_id = $1
     or t.assignee_id = $1
     order by c.display_order, c.created_time`,
    [auth.uid]
  )

  return { categories }
}
