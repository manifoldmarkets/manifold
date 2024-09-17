import { getManaSupply as fetchManaSupply } from 'shared/mana-supply'
import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getManaSupply: APIHandler<'get-mana-supply'> = async () => {
  const pg = createSupabaseDirectClient()
  return await fetchManaSupply(pg)
}
