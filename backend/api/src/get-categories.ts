import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getCategories: APIHandler<'get-categories'> = async (_, auth) => {
  const pg = createSupabaseDirectClient()

  console.log('Getting categories for user', auth.uid)

  const categories = await pg.manyOrNone(
    `select *
     from categories
     where user_id = $1
     order by display_order, created_time`,
    [auth.uid]
  )

  return { categories }
}
