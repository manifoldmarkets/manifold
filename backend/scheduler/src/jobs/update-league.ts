import { Bet } from 'common/bet'
import { getProfitMetrics } from 'common/calculate'
import {
  excludeSelfTrades,
  filterBetsForLeagueScoring,
  seasonCountsPerpProfit,
} from 'common/leagues'
import { convertContract } from 'common/supabase/contracts'
import { groupBy, keyBy, sum, uniq, zipObject } from 'lodash'
import { calculatePerpSeasonProfits } from 'shared/perps/season-profit'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  getEffectiveCurrentSeason,
  getSeasonStartAndEnd,
} from 'shared/supabase/leagues'
import { bulkUpdate } from 'shared/supabase/utils'
import { contractColumnsToSelectWithPrefix, log } from 'shared/utils'

export async function updateLeague(
  manualSeason?: number,
  tx?: SupabaseDirectClient
) {
  const pg = tx ?? createSupabaseDirectClient()

  const season = manualSeason ?? (await getEffectiveCurrentSeason())
  const boundaries = await getSeasonStartAndEnd(pg, season)
  if (!boundaries) {
    log('Season boundaries not found. Exiting.')
    return
  }
  const { seasonStart, seasonEnd } = boundaries
  log(
    `Season ${season}: ${new Date(seasonStart).toISOString()} to ${new Date(
      seasonEnd
    ).toISOString()}`
  )

  if (Date.now() > seasonEnd) {
    log('Season has ended. Exiting.')
    return
  }

  log('Loading users, bets, and contracts...')
  const results = await pg.multi(
    `select users.id from users
    join leagues on leagues.user_id = users.id
    where leagues.season = $1;
    select cb.data
    from contract_bets as cb
    where created_time > millis_to_ts($2)
      and created_time < millis_to_ts($3);
    select distinct on (contracts.id) ${contractColumnsToSelectWithPrefix(
      'contracts'
    )}
    from contracts
    join contract_bets cb on contracts.id = cb.contract_id
    where cb.created_time > millis_to_ts($2)
      and cb.created_time < millis_to_ts($3)
      and contracts.token = 'MANA'
      and contracts.visibility = 'public'
      and contracts.mechanism is distinct from 'perp'
      and coalesce((contracts.data->'isRanked')::boolean, true) = true;`,
    [season, seasonStart, seasonEnd]
  )

  const userIds = results[0].map((r: any) => r.id as string)
  const bets = results[1].map((r: any) => r.data as Bet)
  const contracts = results[2].map(convertContract)

  const betsByUserId = groupBy(bets, (b) => b.userId)
  const contractsById = keyBy(contracts, 'id')

  log(
    `Loaded ${userIds.length} user ids, ${bets.length} bets, ${contracts.length} contracts.`
  )

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
        contract.mechanism !== 'perp' &&
        contract.isRanked !== false &&
        !EXCLUDED_CONTRACT_SLUGS.has(contract.slug)
      ) {
        // Adjust bets to exclude portions that filled against user's own limit orders
        const nonSelfTradeBets = excludeSelfTrades(contractBets, userId)

        // Filter bets: if it's user's own market, only count bets placed 1+ hour after creation
        const relevantBets = filterBetsForLeagueScoring(
          nonSelfTradeBets,
          contract,
          userId
        )

        if (relevantBets.length > 0) {
          const { profit } = getProfitMetrics(contract, relevantBets)
          if (isNaN(profit)) {
            log.error(
              `Profit is NaN! contract ${contract.slug} (${contract.id}) userId ${userId}`
            )
            continue
          }

          totalProfit += profit
        }
      }
    }
    userProfit.push({
      user_id: userId,
      amount: totalProfit,
      category: 'profit',
    })
  }

  // Include mana earned from unique trader bonuses during the season.
  const uniqueTraderBonuses = await pg.manyOrNone<{
    user_id: string
    amount: number
  }>(
    `select txns.to_id as user_id, sum(txns.amount)::numeric as amount
    from txns
    join contracts on contracts.id = (txns.data->'data'->>'contractId')
    where txns.category = 'UNIQUE_BETTOR_BONUS'
      and txns.token = 'M$'
      and txns.created_time > millis_to_ts($1)
      and txns.created_time < millis_to_ts($2)
      and txns.to_id = any($3)
      and contracts.created_time >= (txns.created_time - interval '31 days')
      and contracts.created_time <= txns.created_time
    group by txns.to_id`,
    [seasonStart, seasonEnd, userIds]
  )

  const userUniqueBonuses: {
    user_id: string
    amount: number
    category: 'UNIQUE_BETTOR_BONUS'
  }[] = uniqueTraderBonuses.map((r) => ({
    user_id: r.user_id,
    amount: +r.amount,
    category: 'UNIQUE_BETTOR_BONUS',
  }))

  // PERP profit and loss counts only from FIRST_SEASON_WITH_PERP_PROFIT on,
  // so no season that began under the old rules is ever rescored.
  const userPerpProfits = seasonCountsPerpProfit(season)
    ? await getUserPerpProfits(pg, season, seasonStart, userIds)
    : []

  const combined = [
    ...userProfit.map((u) => ({ ...u, amount: +u.amount })),
    ...userUniqueBonuses,
    ...userPerpProfits,
  ]

  const amountByUserId = groupBy(combined, 'user_id')
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

// PERP positions have no bets, so they are scored apart from the loop above:
// each position's profit and loss since the season started, including one
// carried in from before it (shared/perps/season-profit).
const getUserPerpProfits = async (
  pg: SupabaseDirectClient,
  season: number,
  seasonStart: number,
  userIds: string[]
) => {
  const { profits, failures } = await calculatePerpSeasonProfits(pg, {
    userIds,
    seasonStart,
  })

  const totals: Record<string, number> = {}
  for (const { userId, profit } of profits) {
    totals[userId] = (totals[userId] ?? 0) + profit
  }

  if (failures.length > 0) {
    // Hold the last total written for anyone whose history could not be
    // replayed rather than score them without that market: a rank that jumps
    // because one replay failed is worse than one that is briefly stale.
    const failedUserIds = uniq(failures.map((f) => f.userId))
    const examples = failures
      .slice(0, 5)
      .map((f) => `${f.userId}/${f.contractId}: ${f.reasons.join('; ')}`)
    log.error(
      `Could not calculate season ${season} PERP profit for ${
        failures.length
      } user/contract pairs; holding the last totals of ${
        failedUserIds.length
      } users. ${examples.join(' | ')}`
    )
    const held = await pg.manyOrNone<{ user_id: string; amount: string }>(
      `select user_id, mana_earned_breakdown->>'perp_profit' as amount
         from leagues
        where season = $1
          and user_id = any($2)
          and mana_earned_breakdown->>'perp_profit' is not null`,
      [season, failedUserIds]
    )
    for (const userId of failedUserIds) delete totals[userId]
    for (const { user_id, amount } of held) totals[user_id] = +amount
  }

  return Object.entries(totals).map(([user_id, amount]) => ({
    user_id,
    amount,
    category: 'perp_profit' as const,
  }))
}

const EXCLUDED_CONTRACT_SLUGS = new Set([
  'will-there-be-another-wellrecognize-393de260ec26',
  'will-there-be-another-wellrecognize-511a499bd82e',
  'will-there-be-another-wellrecognize',
])
