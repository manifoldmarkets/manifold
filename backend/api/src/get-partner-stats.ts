import { sum } from 'lodash'

import { type APIHandler } from './helpers/endpoint'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import {
  PARTNER_QUARTER_START_DATE,
  PARTNER_UNIQUE_TRADER_THRESHOLD,
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

  const tradersByContract = await getCreatorTradersByContract(
    pg,
    userId,
    quarterStart,
    quarterEnd
  )
  const uniqueBettorsMeetingThreshold = Object.values(tradersByContract).filter(
    (traders) => traders >= PARTNER_UNIQUE_TRADER_THRESHOLD
  )
  const numUniqueBettors = sum(uniqueBettorsMeetingThreshold)

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

const getCreatorTradersByContract = async (
  pg: SupabaseDirectClient,
  creatorId: string,
  since: number,
  before: number
) => {
  return Object.fromEntries(
    await pg.map(
      `with contract_traders as (
        select distinct contract_id, user_id from contract_bets
        where created_time >= $2
        and created_time < $3
      )
      select c.id, count(ct.*)::int as total
      from contracts as c
      join contract_traders as ct on c.id = ct.contract_id
      where c.creator_id = $1
      group by c.id`,
      [
        creatorId,
        new Date(since ?? 0).toISOString(),
        new Date(before).toISOString(),
      ],
      (r) => [r.id as string, r.total as number]
    )
  )
}
