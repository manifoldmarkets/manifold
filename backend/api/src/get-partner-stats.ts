import { sumBy, uniq } from 'lodash'

import { APIError, type APIHandler } from './helpers/endpoint'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { PARTNER_USER_IDS } from 'common/envs/constants'
import {
  PARTNER_QUARTER_START_DATE,
  PARTNER_UNIQUE_TRADER_BONUS,
  PARTNER_UNIQUE_TRADER_BONUS_MULTI,
  PARTNER_UNIQUE_TRADER_THRESHOLD,
  getPartnerQuarterEndDate,
} from 'common/partner'
import { OutcomeType } from 'common/contract'

export const getPartnerStats: APIHandler<'get-partner-stats'> = async (
  props
) => {
  const { userId } = props
  if (!PARTNER_USER_IDS.includes(userId))
    throw new APIError(403, 'User is not a partner')

  const pg = createSupabaseDirectClient()

  const quarterStart = PARTNER_QUARTER_START_DATE.getTime()
  const quarterEnd = getPartnerQuarterEndDate(
    PARTNER_QUARTER_START_DATE
  ).getTime()

  const userResult = await pg.one<{
    username: string
  }>(`SELECT username FROM users WHERE id = $1`, [userId])

  const username = userResult?.username ?? 'Unknown'

  const numContractsCreated = await getNumContractsCreated(
    pg,
    userId,
    quarterStart,
    quarterEnd
  )

  const thisQuarterContractTraders = await getCreatorTradersByContract(
    pg,
    userId,
    quarterStart,
    quarterEnd
  )
  const contractIds = uniq(thisQuarterContractTraders.map((t) => t.contract_id))
  const previousContractTraders = await getCreatorTradersByContract(
    pg,
    userId,
    0,
    quarterStart,
    contractIds
  )
  const previousContractTradersObj = Object.fromEntries(
    previousContractTraders.map((t) => [t.contract_id, t])
  )

  const totalContractTraders = thisQuarterContractTraders.map((t) => ({
    ...t,
    total: t.total + (previousContractTradersObj[t.contract_id]?.total ?? 0),
  }))

  const contractIdsMeetingThreshold = new Set(
    totalContractTraders
      .filter((traders) => traders.total >= PARTNER_UNIQUE_TRADER_THRESHOLD)
      .map((t) => t.contract_id)
  )
  const thisQuarterContractTradersMeetingThreshold =
    thisQuarterContractTraders.filter((t) =>
      contractIdsMeetingThreshold.has(t.contract_id)
    )

  const numUniqueBettors: number = sumBy(
    thisQuarterContractTradersMeetingThreshold,
    'total'
  )
  const numBinaryBettors = sumBy(
    thisQuarterContractTradersMeetingThreshold,
    (t) => (t.outcome_type === 'BINARY' ? t.total : 0)
  )
  const numMultiChoiceBettors = sumBy(
    thisQuarterContractTradersMeetingThreshold,
    (t) => (t.outcome_type === 'MULTIPLE_CHOICE' ? t.total : 0)
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

  const numBinaryBettorsNumber = Number(numBinaryBettors) || 0
  const numMultiChoiceBettorsNumber = Number(numMultiChoiceBettors) || 0
  const numReferralsNumber = Number(numReferrals) || 0

  const totalTraderIncome =
    numBinaryBettorsNumber * PARTNER_UNIQUE_TRADER_BONUS +
    numMultiChoiceBettorsNumber * PARTNER_UNIQUE_TRADER_BONUS_MULTI
  const dollarsEarned = totalTraderIncome + numReferralsNumber

  return {
    status: 'success',
    username,
    numContractsCreated,
    numUniqueBettors,
    numReferrals,
    totalTraderIncome,
    dollarsEarned,
  }
}

const getCreatorTradersByContract = async (
  pg: SupabaseDirectClient,
  creatorId: string,
  since: number,
  before: number,
  contractIds?: string[]
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
        and $4 is null or contract_id = any($4)
        and is_redemption = false
        and (is_api is null or is_api = false)
        and amount != 0
        and user_id != $1
      )
      select c.id as contract_id, outcome_type, count(*)::int as total
      from contracts as c
      join contract_traders as ct on c.id = ct.contract_id
      where c.creator_id = $1
      and (c.resolution_time is null or c.resolution_time > $2)
      and c.visibility = 'public'
      and (c.data->>'isSubsidized' is null or c.data->>'isSubsidized' = 'true')
      group by c.id, outcome_type`,
    [
      creatorId,
      new Date(since ?? 0).toISOString(),
      new Date(before).toISOString(),
      contractIds ?? null,
    ]
  )
}

const getNumContractsCreated = async (
  pg: SupabaseDirectClient,
  creatorId: string,
  quarterStart: number,
  quarterEnd: number
) => {
  const result = await pg.one(
    `
  select count(*) as count
  from contracts
  where creator_id = $1
  and created_time >= $2
  and created_time < $3
  and mechanism != 'none'`,
    [
      creatorId,
      new Date(quarterStart).toISOString(),
      new Date(quarterEnd).toISOString(),
    ]
  )

  return result.count
}
