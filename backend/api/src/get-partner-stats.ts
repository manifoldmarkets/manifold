import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { PARTNER_USER_IDS } from 'common/envs/constants'

export const getPartnerStats: APIHandler<'get-partner-stats'> = async (
  props,
  auth
) => {
  const { userId } = props
  if (!PARTNER_USER_IDS.includes(userId))
    return {
      status: 'error',
      numUniqueBettors: 0,
    }

  const pg = createSupabaseDirectClient()

  const quarterStart = new Date('2024-02-21').getTime()
  const quarterEnd = new Date('2024-05-21').getTime()

  const uniqueBettorBonuses = await pg.oneOrNone<{
    num_unique_bettors: number
  }>(
    `select count(*) as num_unique_bettors
    from txns 
    where
      data->>'toId' = $1
      and (txns.data->'data'->>'isPartner')::boolean
      and (txns.data->>'createdTime')::bigint > $2
      and (txns.data->>'createdTime')::bigint < $3
      and txns.data->>'category' = 'UNIQUE_BETTOR_BONUS'
    `,
    [userId, quarterStart, quarterEnd]
  )
  const numUniqueBettors = uniqueBettorBonuses?.num_unique_bettors ?? 0

  return {
    status: 'success',
    numUniqueBettors,
  }
}
