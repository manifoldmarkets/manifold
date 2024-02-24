import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import {
  PARTNER_QUARTER_START_DATE,
  getPartnerQuarterEndDate,
} from 'common/partner'

export const getPartnerStats: APIHandler<'get-partner-stats'> = async (
  props,
  auth
) => {
  const { userId } = props
  if (!PARTNER_USER_IDS.includes(userId))
    return {
      status: 'error',
      numUniqueBettors: 0,
      numReferrals: 0,
    }

  const pg = createSupabaseDirectClient()

  const quarterStart = PARTNER_QUARTER_START_DATE.getTime()
  const quarterEnd = getPartnerQuarterEndDate(
    PARTNER_QUARTER_START_DATE
  ).getTime()

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

  const referrals = await pg.oneOrNone<{
    num_referred: number
  }>(
    `select count(*) as num_referred
  from users
  where
    data->>'referredByUserId' = $1
    and (users.data->>'createdTime')::bigint > $2
    and (users.data->>'createdTime')::bigint < $3
  `,
    [userId, quarterStart, quarterEnd]
  )

  const numReferrals = referrals?.num_referred ?? 0

  return {
    status: 'success',
    numUniqueBettors,
    numReferrals,
  }
}
