import { log } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getCategories: APIHandler<'get-categories'> = async (_, auth) => {
  const pg = createSupabaseDirectClient()

  log('Getting categories for user', auth.uid)

  const categories = await pg.manyOrNone(
    `SELECT DISTINCT ON (c.id) c.*
     FROM categories c
     LEFT JOIN tasks t ON c.id = t.category_id
     WHERE c.user_id = $1
     OR t.assignee_id = $1
     ORDER BY c.id, c.display_order, c.created_time`,
    [auth.uid]
  )

  return { categories }
}
