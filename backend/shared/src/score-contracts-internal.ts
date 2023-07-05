import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient } from 'common/supabase/utils'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { Contract } from 'common/contract'
import { getRecentContractLikes } from 'shared/supabase/likes'
import {
  insertMarketMovementContractToUsersFeeds,
  insertTrendingContractToUsersFeeds,
} from 'shared/create-feed'
import { computeContractScores, getContractTraders } from './importance-score'
import { bulkUpdate } from 'shared/supabase/utils'

export const MINUTE_INTERVAL = 15

export async function scoreContractsInternal(
  db: SupabaseClient,
  pg: SupabaseDirectClient,
  readOnly = false
) {
  const now = Date.now()
  const lastUpdatedTime = now - MINUTE_INTERVAL * MINUTE_MS
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const activeContracts = await pg.map(
    `select data from contracts where ((data->'lastUpdatedTime')::numeric) > $1
            order by importance_score desc`,
    [lastUpdatedTime],
    (row) => row.data as Contract
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContracts = await pg.map(
    `select data from contracts where
        (data ? 'dailyScore' AND (data->>'dailyScore')::numeric > 0)
            or popularity_score > 0
            order by importance_score desc
            `,
    [],
    (row) => row.data as Contract
  )

  const activeContractIds = activeContracts.map((c) => c.id)
  const previouslyActiveContractsFiltered = (
    previouslyActiveContracts ?? []
  ).filter((c) => !activeContractIds.includes(c.id))

  const contracts = activeContracts.concat(previouslyActiveContractsFiltered)
  const contractIds = contracts.map((c) => c.id)
  log(`Found ${contracts.length} contracts to score`)

  const contractScoreUpdates: Contract[] = []

  const todayLikesByContract = await getRecentContractLikes(db, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(db, weekAgo)
  const todayTradersByContract = await getContractTraders(
    pg,
    dayAgo,
    contractIds
  )
  const hourAgoTradersByContract = await getContractTraders(
    pg,
    hourAgo,
    contractIds
  )
  const thisWeekTradersByContract = await getContractTraders(
    pg,
    weekAgo,
    contractIds
  )

  for (const contract of contracts) {
    // scores themselves are not updated in importance-score
    const { todayScore, thisWeekScore, popularityScore, dailyScore } =
      computeContractScores(
        now,
        contract,
        todayLikesByContract[contract.id] ?? 0,
        thisWeekLikesByContract[contract.id] ?? 0,
        todayTradersByContract[contract.id] ?? 0,
        hourAgoTradersByContract[contract.id] ?? 0,
        thisWeekTradersByContract[contract.id] ?? 0
      )

    // This is a newly trending contract, and should be at the top of most users' feeds
    if (todayScore > 10 && todayScore / thisWeekScore > 0.5 && !readOnly) {
      log('inserting specifically today trending contract', contract.id)
      await insertTrendingContractToUsersFeeds(contract, now - 2 * DAY_MS, {
        todayScore,
        thisWeekScore,
        importanceScore: contract.importanceScore,
      })
    }
    // If it's already popular but has had 5 new traders in the past hour, add it to the feed
    else if (
      popularityScore > 20 &&
      hourAgoTradersByContract[contract.id] > 5 &&
      !readOnly
    ) {
      log(
        'inserting generally trending, recently popular contract',
        contract.id,
        'with popularity score',
        popularityScore,
        'and',
        hourAgoTradersByContract[contract.id],
        'traders in the past hour'
      )
      await insertTrendingContractToUsersFeeds(contract, weekAgo, {
        tradersInPastHour: hourAgoTradersByContract[contract.id],
        popularityScore,
        importanceScore: contract.importanceScore,
      })
    }

    // If it's just undergone a large prob change, add it to the feed
    if (dailyScore > 1.5 && dailyScore - contract.dailyScore > 1 && !readOnly) {
      log(
        'inserting market movement with daily score',
        dailyScore.toFixed(2),
        ' and prev score',
        contract.dailyScore.toFixed(2),
        'for contract',
        contract.id
      )
      await insertMarketMovementContractToUsersFeeds(contract)
    }
    if (
      contract.popularityScore !== popularityScore ||
      contract.dailyScore !== dailyScore
    ) {
      contract.popularityScore = popularityScore
      contract.dailyScore = dailyScore
      contractScoreUpdates.push(contract)
    }
  }
  await bulkUpdate(
    pg,
    'contracts',
    ['id'],
    contractScoreUpdates.map((contract) => ({
      id: contract.id,
      data: `${JSON.stringify(contract)}::jsonb`,
      popularity_score: contract.popularityScore,
    }))
  )
  log(`Finished scoring ${contractScoreUpdates.length} contracts`)
}
