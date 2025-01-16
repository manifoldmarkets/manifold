import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertContract } from 'common/supabase/contracts'
import { toLiteMarket } from 'common/api/market-types'

export const checkSportsEvent: APIHandler<'check-sports-event'> = async (props) => {
  const pg = createSupabaseDirectClient()
  
  const existingContract = await pg.oneOrNone(
    `select data from contracts where data->>'sportsEventId' = $1 and token = 'MANA' limit 1`,
    [props.sportsEventId]
  )

  if (!existingContract) {
    return { exists: false }
  }

  const contract = convertContract(existingContract)
  return {
    exists: true,
    existingMarket: toLiteMarket(contract)
  }
}
