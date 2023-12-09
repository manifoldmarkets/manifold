import { createSupabaseClient } from 'shared/supabase/init'
import { typedEndpoint } from './helpers'
import { getLeaguesForUser } from 'shared/supabase/leagues'

export const getLeagues = typedEndpoint('leagues', async (props) => {
  const db = createSupabaseClient()
  return getLeaguesForUser(db, props)
})
