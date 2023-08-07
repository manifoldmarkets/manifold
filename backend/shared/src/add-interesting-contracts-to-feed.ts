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
import { userInterestEmbeddings } from 'shared/supabase/vectors'
import { getWhenToIgnoreUsersTime } from 'shared/supabase/users'
const rowToContract = (row: any) =>
  ({
    ...(row.data as Contract),
    importanceScore: row.importance_score,
  } as Contract)

export const MINUTE_INTERVAL = 20

export async function addInterestingContractsToFeed(
  db: SupabaseClient,
  pg: SupabaseDirectClient,
  readOnly = false
) {
  await loadUserEmbeddingsToStore(pg)
  const now = Date.now()
  const lastUpdatedTime = now - MINUTE_INTERVAL * MINUTE_MS
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const activeContracts = await pg.map(
    `select data, importance_score from contracts 
            where ((data->'lastUpdatedTime')::numeric) > $1
            order by importance_score desc`,
    [lastUpdatedTime],
    rowToContract
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContracts = await pg.map(
    `select data, importance_score from contracts 
            where importance_score > 0.15
            and id not in ($1:list)
            order by importance_score desc 
            `,
    [activeContracts.map((c) => c.id)],
    rowToContract
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
    const { todayScore, logOddsChange, thisWeekScore, importanceScore } =
      computeContractScores(
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
      log('Inserting specifically today trending contract', contract.id)
      await insertTrendingContractToUsersFeeds(contract, now - 2 * DAY_MS, {
        todayScore,
        thisWeekScore,
        importanceScore: parseFloat(importanceScore.toPrecision(2)),
      })
    } else if (
      importanceScore > 0.6 ||
      (importanceScore > 0.25 &&
        (hourAgoTradersByContract[contract.id] ?? 0) >= 4 &&
        !readOnly)
    ) {
      log(
        'Inserting generally trending, recently popular contract',
        contract.id,
        'with importance score',
        importanceScore,
        'and',
        hourAgoTradersByContract[contract.id],
        'traders in the past hour'
      )
      await insertTrendingContractToUsersFeeds(contract, now - 3 * DAY_MS, {
        tradersInPastHour: hourAgoTradersByContract[contract.id] ?? 0,
        importanceScore: parseFloat(importanceScore.toPrecision(2)),
      })
    }

    // If it's just undergone a large prob change and wasn't created today, add it to the feed
    if (logOddsChange > 0.8 && contract.mechanism === 'cpmm-1') {
      log(
        'Inserting market movement with prob',
        contract.prob,
        ' and prev prob',
        contract.prob - contract.probChanges.day,
        'for contract',
        contract.id
      )
      if (!readOnly) await insertMarketMovementContractToUsersFeeds(contract)
    }
  }
  log('Done adding trending contracts to feed')
}

const loadUserEmbeddingsToStore = async (pg: SupabaseDirectClient) => {
  const longAgo = getWhenToIgnoreUsersTime()
  await pg.map(
    `
      select u.id as user_id,
      ((u.data->'createdTime')::bigint) as created_time,
      ((u.data->'lastBetTime')::bigint) as last_bet_time,
      interest_embedding,
      disinterest_embedding 
    from user_embeddings
    join users u on u.id = user_embeddings.user_id
    join (
        select usm.user_id, max(usm.created_time) as max_created_time
        from user_seen_markets usm
        group by usm.user_id
    ) as usm on u.id = usm.user_id
    where ((u.data->'lastBetTime')::bigint is not null and (u.data->'lastBetTime')::bigint >= $1) 
        or ((u.data->'lastBetTime')::bigint is null and (u.data->'createdTime')::bigint >= $1)
        or (usm.max_created_time >= millis_to_ts($1))
        or (random() <= 0.1)
    `,
    [longAgo],
    (row) => {
      const interest = JSON.parse(row.interest_embedding) as number[]
      const disinterest = row.disinterest_embedding
        ? (JSON.parse(row.disinterest_embedding) as number[])
        : null

      userInterestEmbeddings[row.user_id] = {
        interest,
        disinterest,
        lastBetTime: row.last_bet_time,
        createdTime: row.created_time,
      }
    }
  )
}
