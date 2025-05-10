import { groupBy, keyBy, sum, uniq, zipObject } from 'lodash'
import { log } from 'shared/utils'
import { Bet } from 'common/bet'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkUpdate } from 'shared/supabase/utils'
import { getSeasonDates } from 'common/leagues'
import { getProfitMetrics } from 'common/calculate'
import { convertContract } from 'common/supabase/contracts'
import {
  getEffectiveCurrentSeason,
  getSeasonEndTimeRow,
} from 'shared/supabase/leagues'

export async function updateLeague(
  manualSeason?: number,
  tx?: SupabaseDirectClient
) {
  const pg = tx ?? createSupabaseDirectClient()

  const season = manualSeason ?? (await getEffectiveCurrentSeason())
  let seasonInfo = await getSeasonEndTimeRow(pg, season)
  if (!seasonInfo) {
    log('Season info not found. Exiting.')
    return
  }
  const { start } = getSeasonDates(season)
  log(`Season start: ${start}`)
  const seasonStart = start.getTime()
  const seasonEnd = seasonInfo.end_time

  if (Date.now() > seasonEnd) {
    log('Season has ended. Exiting.')
    return
  }

  log('Loading users...')
  const userIds = await pg.map(
    `select users.id from users
    join leagues on leagues.user_id = users.id
    where leagues.season = $1`,
    [season],
    (r) => r.id as string
  )
  log(`Loaded ${userIds.length} user ids.`)

  // // Earned fees from bets in your markets during the season.
  // const creatorFees = await pg.manyOrNone<{
  //   user_id: string
  //   category: string
  //   amount: number
  // }>(
  //   `select
  //     contracts.creator_id as user_id,
  //     'CREATOR_FEE' as category,
  //     sum((cb.data->'fees'->>'creatorFee')::numeric) as amount
  //   from contract_bets cb
  //   join contracts on contracts.id = cb.contract_id
  //   where
  //     cb.created_time > millis_to_ts($2)
  //     and cb.created_time < millis_to_ts($3)
  //   group by contracts.creator_id
  //   `,
  //   [season, seasonStart, seasonEnd]
  // )

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
  const contractsById = keyBy(contracts, 'id')

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
        contract &&
        contract.token === 'MANA' &&
        contract.visibility === 'public' &&
        contract.isRanked !== false &&
        !EXCLUDED_CONTRACT_SLUGS.has(contract.slug)
      ) {
        const { profit } = getProfitMetrics(contract, contractBets)
        if (isNaN(profit)) {
          log.error(
            `Profit is NaN! contract ${contract.slug} (${contract.id}) userId ${userId}`
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
    userProfit.map((u) => ({
      ...u,
      amount: +u.amount,
    })),
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
      season,
      mana_earned: total,
      mana_earned_breakdown: `${JSON.stringify(manaEarnedBreakdown)}::jsonb`,
    })
  }

  log(`Mana earned updates: ${manaEarnedUpdates.length}`)

  await bulkUpdate(pg, 'leagues', ['user_id', 'season'], manaEarnedUpdates)
  log('Done.')
}

const getRelevantContracts = async (pg: SupabaseDirectClient, bets: Bet[]) => {
  const betContractIds = uniq(bets.map((b) => b.contractId))
  if (betContractIds.length === 0) return []
  return await pg.map(
    `select * from contracts
    where id in ($1:list)
    and token = 'MANA'
    and visibility = 'public'
    and coalesce((data->'isRanked')::boolean, true) = true`,
    [betContractIds],
    convertContract
  )
}

const EXCLUDED_CONTRACT_SLUGS = new Set([
  'will-there-be-another-wellrecognize-393de260ec26',
  'will-there-be-another-wellrecognize-511a499bd82e',
  'will-there-be-another-wellrecognize',
])
