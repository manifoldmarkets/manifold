import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getSportsIndex } from 'shared/supabase/sports-index'

export const sportsIndex: APIHandler<'sports-index'> = async () => {
  const index = await getSportsIndex(createSupabaseDirectClient())
  return { sports: index.sports }
}
