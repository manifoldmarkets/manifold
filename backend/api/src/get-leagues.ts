import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type APIHandler } from './helpers/endpoint'
import { getLeaguesForUser } from 'shared/supabase/leagues'

export const getLeagues: APIHandler<'leagues'> = async (props) => {
  const pg = createSupabaseDirectClient()
  return getLeaguesForUser(pg, props)
}
