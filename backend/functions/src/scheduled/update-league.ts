import * as functions from 'firebase-functions'
import { groupBy, sum, uniq, zipObject } from 'lodash'

import { log, revalidateStaticProps } from 'shared/utils'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkUpdate } from 'shared/supabase/utils'
import { secrets } from 'common/secrets'
import { CURRENT_SEASON, getSeasonDates } from 'common/leagues'
import { getContractBetMetrics } from 'common/calculate'
import { DAY_MS } from 'common/util/time'

// Disable updates between freezing a season and starting the next one.
const DISABLED = false

export const updateLeague = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    await updateLeagueCore()
  })

export async function updateLeagueCore() {
  const pg = createSupabaseDirectClient()

  const season = CURRENT_SEASON
  const { start, end } = getSeasonDates(season)
  const seasonStart = start.getTime()
  const seasonEnd = end.getTime() + DAY_MS
  log('Loading users...')
  const userIds = await pg.map(
    `select id from users
    join leagues on leagues.user_id = users.id
    where leagues.season = $1`,
    [season],
    (r) => r.id as string
  )
  log(`Loaded ${userIds.length} user ids.`)

  log('Loading txns...')
  const txnCategoriesCountedAsManaEarned = [
    'BETTING_STREAK_BONUS',
    'AD_REDEEM',
    'MARKET_BOOST_REDEEM',
    'QUEST_REWARD',
  ]
  const txnData = await pg.manyOrNone<{
    user_id: string
    category: string
    amount: number
  }>(
    `select
      user_id,
      data->>'category' as category,
      sum((data->>'amount')::numeric) as amount
    from txns
    join
      leagues on leagues.user_id = txns.data->>'toId'
    where
      leagues.season = $1
      and (data->>'createdTime')::bigint > $2
      and (data->>'createdTime')::bigint < $3
      and data->>'category' in ($4:csv)
    group by user_id, category
    `,
    [season, seasonStart, seasonEnd, txnCategoriesCountedAsManaEarned]
  )

  // Require that the contract that is giving the unique bettor bonus
  // was created during the current season.
  const uniqueBettorBonuses = await pg.manyOrNone<{
    user_id: string
    category: string
    amount: number
  }>(
    `select
      user_id,
      txns.data->>'category' as category,
      sum((txns.data->>'amount')::numeric) as amount
    from txns 
    join
      leagues on leagues.user_id = txns.data->>'toId'
    join
      contracts on contracts.id = txns.data->'data'->>'contractId'
    where
      leagues.season = $1
      and ts_to_millis(contracts.created_time) > $2
      and ts_to_millis(contracts.created_time) < $3
      and (txns.data->>'createdTime')::bigint > $2
      and (txns.data->>'createdTime')::bigint < $3
      and txns.data->>'category' = 'UNIQUE_BETTOR_BONUS'
    group by user_id, category
    `,
    [season, seasonStart, seasonEnd]
  )

  const negativeBettorBonuses = await pg.manyOrNone<{
    user_id: string
    category: string
    amount: number
  }>(
    `select
      user_id,
      txns.data->>'category' as category,
      -1 * sum((txns.data->>'amount')::numeric) as amount
    from txns 
    join
      leagues on leagues.user_id = txns.data->>'fromId'
    join
      contracts on contracts.id = txns.data->'data'->>'contractId'
    where
      leagues.season = $1
      and ts_to_millis(contracts.created_time) > $2
      and ts_to_millis(contracts.created_time) < $3
      and (txns.data->>'createdTime')::bigint > $2
      and (txns.data->>'createdTime')::bigint < $3
      and txns.data->>'category' = 'CANCEL_UNIQUE_BETTOR_BONUS'
    group by user_id, category
    `,
    [season, seasonStart, seasonEnd]
  )

  console.log(
    'Loaded txns per user',
    txnData.length,
    'unique bettor bonuses',
    uniqueBettorBonuses.length,
    'negative bettor bonuses',
    negativeBettorBonuses.length
  )

  log('Loading bets...')
  const betData = await pg.manyOrNone<{ data: Bet }>(
    `select cb.data
    from
      contract_bets as cb
    where
      created_time > millis_to_ts($1)
      and created_time < millis_to_ts($2)
    `,
    [seasonStart, seasonEnd]
  )
  const bets = betData.map((b) => b.data)
  const betsByUserId = groupBy(bets, (b) => b.userId)
  log(`Loaded ${bets.length} bets.`)

  log('Loading contracts...')
  const contracts = await getRelevantContracts(pg, bets)
  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))
  log(`Loaded ${contracts.length} contracts.`)

  log('Computing metric updates...')
  const userProfit: { user_id: string; amount: number; category: 'profit' }[] =
    []
  for (const userId of userIds) {
    const userBets = betsByUserId[userId] ?? []
    const betsByContract = groupBy(userBets, (b) => b.contractId)
    let totalProfit = 0

    for (const [contractId, contractBets] of Object.entries(betsByContract)) {
      const contract = contractsById[contractId]
      if (
        contract.visibility === 'public' &&
        !EXCLUDED_CONTRACT_SLUGS.has(contract.slug)
      ) {
        const { profit } = getContractBetMetrics(contract, contractBets)
        if (isNaN(profit)) {
          console.error(
            'Profit is NaN! contract',
            contract.slug,
            contract.id,
            'userId',
            userId
          )
          continue
        }

        totalProfit += profit
      }
    }
    userProfit.push({
      user_id: userId,
      amount: totalProfit,
      category: 'profit',
    })
  }

  const amountByUserId = groupBy(
    [
      ...userProfit,
      ...txnData,
      ...uniqueBettorBonuses,
      ...negativeBettorBonuses,
    ].map((u) => ({ ...u, amount: +u.amount })),
    'user_id'
  )

  const manaEarnedUpdates = []
  for (const [userId, manaEarned] of Object.entries(amountByUserId)) {
    const keys = manaEarned.map((a) => a.category)
    const amounts = manaEarned.map((a) => a.amount)
    const manaEarnedBreakdown = zipObject(keys, amounts)
    const total = sum(amounts)

    manaEarnedUpdates.push({
      user_id: userId,
      mana_earned: total,
      mana_earned_breakdown: `${JSON.stringify(manaEarnedBreakdown)}::jsonb`,
    })
  }

  console.log('Mana earned updates', manaEarnedUpdates.length)

  if (!DISABLED) {
    await bulkUpdate(pg, 'leagues', 'user_id', manaEarnedUpdates)
    await revalidateStaticProps('/leagues')
  } else {
    log('Skipping writing update because DISABLED=true')
  }
  log('Done.')
}

const getRelevantContracts = async (pg: SupabaseDirectClient, bets: Bet[]) => {
  const betContractIds = uniq(bets.map((b) => b.contractId))
  return await pg.map(
    `select data from contracts where id in ($1:list)`,
    [betContractIds],
    (r) => r.data as Contract
  )
}

const EXCLUDED_CONTRACT_SLUGS = new Set([
  'will-there-be-another-wellrecognize-393de260ec26',
  'will-there-be-another-wellrecognize-511a499bd82e',
  'will-there-be-another-wellrecognize',
])
