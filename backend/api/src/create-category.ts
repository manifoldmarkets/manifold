import { log } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const createCategory: APIHandler<'create-category'> = async (
  props,
  auth
) => {
  const { name, color } = props
  const pg = createSupabaseDirectClient()

  log('Creating category', { userId: auth.uid, name, color })

  const result = await pg.one(
    `insert into categories (user_id, name, color)
     values ($1, $2, $3)
     returning id`,
    [auth.uid, name, color]
  )

  return { id: result.id }
}
