import { sumBy } from 'lodash'

import { APIError, type APIHandler } from './helpers/endpoint'
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
import { OutcomeType } from 'common/contract'

export const getPartnerStats: APIHandler<'get-partner-stats'> = async (
  props
) => {
  const { userId } = props
  if (!PARTNER_USER_IDS.includes(userId))
    throw new APIError(400, 'User is not a partner')

  const pg = createSupabaseDirectClient()

  const quarterStart = PARTNER_QUARTER_START_DATE.getTime()
  const quarterEnd = getPartnerQuarterEndDate(
    PARTNER_QUARTER_START_DATE
  ).getTime()

  const contractTraderTotals = await getCreatorTradersByContract(
    pg,
    userId,
    quarterStart,
    quarterEnd
  )
  const uniqueBettorsMeetingThreshold = contractTraderTotals.filter(
    (traders) => traders.total >= PARTNER_UNIQUE_TRADER_THRESHOLD
  )
  const numUniqueBettors: number = sumBy(uniqueBettorsMeetingThreshold, 'total')
  const numBinaryBettors = sumBy(uniqueBettorsMeetingThreshold, (t) =>
    t.outcome_type === 'BINARY' ? t.total : 0
  )
  const numMultiChoiceBettors = sumBy(uniqueBettorsMeetingThreshold, (t) =>
    t.outcome_type === 'MULTIPLE_CHOICE' ? t.total : 0
  )

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
    numBinaryBettors,
    numMultiChoiceBettors,
    numReferrals,
  }
}

const getCreatorTradersByContract = async (
  pg: SupabaseDirectClient,
  creatorId: string,
  since: number,
  before: number
) => {
  return await pg.manyOrNone<{
    contract_id: string
    outcome_type: OutcomeType
    total: number
  }>(
    `with contract_traders as (
        select distinct contract_id, user_id
        from contract_bets
        where created_time >= $2
        and created_time < $3
      )
      select c.id as contract_id, outcome_type, count(*)::int as total
      from contracts as c
      join contract_traders as ct on c.id = ct.contract_id
      where c.creator_id = $1
      group by c.id, outcome_type`,
    [
      creatorId,
      new Date(since ?? 0).toISOString(),
      new Date(before).toISOString(),
    ]
  )
}
