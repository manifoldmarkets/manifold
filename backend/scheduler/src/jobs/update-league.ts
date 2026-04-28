import { Bet } from 'common/bet'
import { getProfitMetrics } from 'common/calculate'
import { excludeSelfTrades, filterBetsForLeagueScoring } from 'common/leagues'
import { convertContract } from 'common/supabase/contracts'
import { groupBy, keyBy, sum, zipObject } from 'lodash'
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

  // Perp PnL per user during the season, computed from contract_perp_events.
  // Profit = sum(payouts received on close/liq/adl + current-position value at
  // oracle price) - sum(originalCostBasis deposited during the season).
  // Only counts contracts that satisfy the league-inclusion filter (public,
  // MANA, ranked, and bettor is not the creator).
  const perpProfitRows = await pg.manyOrNone<{
    user_id: string
    profit: number
  }>(
    `with season_events as (
       select e.*, c.creator_id, c.data
       from contract_perp_events e
       join contracts c on c.id = e.contract_id
       where e.ts >= millis_to_ts($1)
         and e.ts < millis_to_ts($2)
         and e.user_id = any($3)
         and c.token = 'MANA'
         and c.visibility = 'public'
         and coalesce((c.data->'isRanked')::boolean, true) = true
         and e.user_id != c.creator_id
     ),
     invested as (
       select user_id, sum(
         case when event_type in ('open','add') and original_cost_basis_delta > 0
              then original_cost_basis_delta else 0 end
       ) as total_invested
       from season_events
       group by user_id
     ),
     realized as (
       select user_id, sum(coalesce((data->>'payout')::numeric, 0)) as total_payout
       from season_events
       where event_type in ('close','liquidation','adl')
       group by user_id
     ),
     unrealized as (
       select p.user_id,
         sum(
           case when p.direction = 'long'
                then p.cost_basis + p.size * ((c.data->>'oraclePrice')::numeric - p.entry_price) / p.entry_price
                else p.cost_basis - p.size * ((c.data->>'oraclePrice')::numeric - p.entry_price) / p.entry_price
           end
         ) as total_unrealized
       from contract_perp_positions p
       join contracts c on c.id = p.contract_id
       where p.user_id = any($3)
         and c.token = 'MANA'
         and c.visibility = 'public'
         and coalesce((c.data->'isRanked')::boolean, true) = true
         and p.user_id != c.creator_id
       group by p.user_id
     )
     select u.user_id,
       (coalesce(r.total_payout, 0)
        + coalesce(un.total_unrealized, 0)
        - coalesce(u.total_invested, 0))::numeric as profit
     from invested u
     left join realized r on r.user_id = u.user_id
     left join unrealized un on un.user_id = u.user_id`,
    [seasonStart, seasonEnd, userIds]
  )

  const perpProfitByUser: {
    user_id: string
    amount: number
    category: 'perp_profit'
  }[] = perpProfitRows.map((r) => ({
    user_id: r.user_id,
    amount: +r.profit,
    category: 'perp_profit',
  }))

  const combined = [
    ...userProfit.map((u) => ({ ...u, amount: +u.amount })),
    ...userUniqueBonuses,
    ...perpProfitByUser,
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
