import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getMarketLinks } from 'shared/supabase/market-links'
import { type APIHandler } from './helpers/endpoint'

// A sports game can collect dozens of markets; the info dialog lists the
// newest and says how many more there are.
const MAX_CHILDREN = 50

// A market's link and the markets linked to it, for its info dialog and the
// race cards on the election map.
export const getMarketLinksHandler: APIHandler<'get-market-links'> = async ({
  contractId,
}) => getMarketLinks(createSupabaseDirectClient(), contractId, MAX_CHILDREN)
