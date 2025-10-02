import { Bet } from 'common/bet'
import { getProfitMetrics } from 'common/calculate'
import { filterBetsForLeagueScoring, getSeasonDates } from 'common/leagues'
import { convertContract } from 'common/supabase/contracts'
import { groupBy, keyBy, sum, zipObject } from 'lodash'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  getEffectiveCurrentSeason,
  getSeasonEndTimeRow,
} from 'shared/supabase/leagues'
import { bulkUpdate } from 'shared/supabase/utils'
import { contractColumnsToSelectWithPrefix, log } from 'shared/utils'

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
        contract.isRanked !== false &&
        !EXCLUDED_CONTRACT_SLUGS.has(contract.slug)
      ) {
        // Filter bets: if it's user's own market, only count bets placed 1+ hour after creation
        const relevantBets = filterBetsForLeagueScoring(
          contractBets,
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

  const combined = [
    ...userProfit.map((u) => ({ ...u, amount: +u.amount })),
    ...userUniqueBonuses,
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

const EXCLUDED_CONTRACT_SLUGS = new Set([
  'will-there-be-another-wellrecognize-393de260ec26',
  'will-there-be-another-wellrecognize-511a499bd82e',
  'will-there-be-another-wellrecognize',
])
