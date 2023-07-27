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
import {
  computeContractScores,
  getContractTraders,
  getTodayComments,
} from './importance-score'

export const MINUTE_INTERVAL = 30

export async function addInterestingContractsToFeed(
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
    `select data from contracts 
            where ((data->'lastUpdatedTime')::numeric) > $1
            order by importance_score desc`,
    [lastUpdatedTime],
    (row) => row.data as Contract
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContracts = await pg.map(
    `select data from contracts 
            where importance_score > 0.15
            order by importance_score desc 
            limit 5000`,
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

  const todayComments = await getTodayComments(db)
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
    const {
      todayScore,
      logOddsChange,
      thisWeekScore,
      popularityScore,
      importanceScore,
    } = computeContractScores(
      now,
      contract,
      todayComments[contract.id] ?? 0,
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
    } else if (
      importanceScore > 0.6 ||
      (importanceScore > 0.25 &&
        (hourAgoTradersByContract[contract.id] ?? 0) >= 3 &&
        !readOnly)
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
      await insertTrendingContractToUsersFeeds(contract, now - 3 * DAY_MS, {
        tradersInPastHour: hourAgoTradersByContract[contract.id] ?? 0,
        popularityScore,
        importanceScore: contract.importanceScore,
      })
    }

    // If it's just undergone a large prob change and wasn't created today, add it to the feed
    if (logOddsChange > 0.8 && contract.mechanism === 'cpmm-1') {
      log(
        'inserting market movement with prob',
        contract.prob,
        ' and prev prob',
        contract.prob - contract.probChanges.day,
        'for contract',
        contract.id
      )
      if (!readOnly) await insertMarketMovementContractToUsersFeeds(contract)
    }
  }
}
