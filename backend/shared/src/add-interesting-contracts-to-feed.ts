import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient, tsToMillis } from 'common/supabase/utils'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { GCPLog } from 'shared/utils'
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
import {
  UserEmbeddingDetails,
  userInterestEmbeddings,
} from 'shared/supabase/vectors'
import { Dictionary, pickBy } from 'lodash'
import { getWhenToIgnoreUsersTime } from 'shared/supabase/users'
import { DEFAULT_FEED_USER_ID } from 'common/feed'
import { convertContract } from 'common/supabase/contracts'

export const MINUTE_INTERVAL = 60
let lastLoadedTime = 0

export async function addInterestingContractsToFeed(
  db: SupabaseClient,
  pg: SupabaseDirectClient,
  reloadAllEmbeddings: boolean,
  log: GCPLog,
  readOnly = false
) {
  log(`Starting feed population. Loading user embeddings to store...`)
  if (Object.keys(userInterestEmbeddings).length === 0 || reloadAllEmbeddings)
    await loadUserEmbeddingsToStore(pg)
  log(`Loaded users. Querying candidate contracts...`)
  // We could query for contracts that've had large changes in prob in the past hour
  const contracts = await pg.map(
    `select data, importance_score from contracts
            where importance_score >= 0.31
            order by importance_score desc
            `,
    [],
    convertContract
  )
  log(`Found ${contracts.length} contracts to add to feed`)

  const contractIds = contracts.map((c) => c.id)
  const now = Date.now()
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
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
    if (Date.now() - lastLoadedTime > 5 * MINUTE_MS) {
      log('Refreshing user embeddings')
      await loadUserEmbeddingsToStore(pg, lastLoadedTime)
    }
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
      log('Inserting specifically today trending contract', {
        contractId: contract.id,
        todayScore,
        thisWeekScore,
        importanceScore,
      })
      await insertTrendingContractToUsersFeeds(
        contract,
        now - 3 * DAY_MS,
        {
          todayScore,
          thisWeekScore,
          importanceScore: parseFloat(importanceScore.toPrecision(2)),
        },
        'new'
      )
    } else if (
      !readOnly &&
      (hourAgoTradersByContract[contract.id] ?? 0) >= (1 - importanceScore) * 15
    ) {
      log('Inserting generally trending, recently popular contract', {
        contractId: contract.id,
        hoursAgoTraders: hourAgoTradersByContract[contract.id],
        todayScore,
        thisWeekScore,
        importanceScore,
      })
      await insertTrendingContractToUsersFeeds(
        contract,
        now - 14 * DAY_MS,
        {
          tradersInPastHour: hourAgoTradersByContract[contract.id] ?? 0,
          importanceScore: parseFloat(importanceScore.toPrecision(2)),
        },
        'old'
      )
    }

    // If it's just undergone a large prob change and wasn't created today, add it to the feed
    if (logOddsChange > 0.8 && contract.mechanism === 'cpmm-1') {
      log('Inserting market movement with prob', {
        contractId: contract.id,
        prob: contract.prob,
        probChange: contract.prob - contract.probChanges.day,
        logOddsChange,
        todayScore,
        importanceScore,
      })
      if (!readOnly) await insertMarketMovementContractToUsersFeeds(contract)
    }
  }
  log('Done adding trending contracts to feed')
}

const getUserEmbeddingDetails = async (
  pg: SupabaseDirectClient,
  since = 0,
  userId: string | null = null
) => {
  const newUserInterestEmbeddings: Dictionary<UserEmbeddingDetails> = {}

  // mqp -- careful with this query, a correlated subquery seemed like it
  // worked best to me to avoid an expensive scan over the huge USM table
  await pg.map(
    `
    select u.id as user_id,
      u.created_time as created_time,
      ((u.data->'lastBetTime')::bigint) as last_bet_time,
      coalesce((
        select ts_to_millis(max(usm.created_time)) as max_created_time
        from user_seen_markets usm
        where usm.user_id = u.id), 0) as last_seen_time,
      interest_embedding,
      disinterest_embedding
    from users as u
    join user_embeddings on u.id = user_embeddings.user_id
    where u.created_time > millis_to_ts($1) and ($2 is null or u.id = $2)
    `,
    [since, userId],
    (row) => {
      const interest = JSON.parse(row.interest_embedding) as number[]
      const disinterest = row.disinterest_embedding
        ? (JSON.parse(row.disinterest_embedding) as number[])
        : null
      const lastBetTime = row.last_bet_time
      const createdTime = tsToMillis(row.created_time)
      const lastSeenTime =
        row.last_seen_time == 0
          ? tsToMillis(row.created_time)
          : row.last_seen_time

      newUserInterestEmbeddings[row.user_id] = {
        interest,
        disinterest,
        lastBetTime,
        createdTime,
        lastSeenTime,
      }
    }
  )
  return newUserInterestEmbeddings
}

const loadUserEmbeddingsToStore = async (
  pg: SupabaseDirectClient,
  since = 0
) => {
  lastLoadedTime = Date.now()
  const newUserInterestEmbeddings = await getUserEmbeddingDetails(pg, since)
  Object.entries(
    filterUserEmbeddings(newUserInterestEmbeddings, getWhenToIgnoreUsersTime())
  ).forEach(([userId, user]) => {
    userInterestEmbeddings[userId] = user
  })

  if (!newUserInterestEmbeddings[DEFAULT_FEED_USER_ID]) {
    const defaultUser = await getUserEmbeddingDetails(
      pg,
      0,
      DEFAULT_FEED_USER_ID
    )
    userInterestEmbeddings[DEFAULT_FEED_USER_ID] =
      defaultUser[DEFAULT_FEED_USER_ID]
  }
}

export const filterUserEmbeddings = (
  userEmbeddings: Dictionary<UserEmbeddingDetails>,
  longAgo: number
): Dictionary<UserEmbeddingDetails> => {
  return pickBy(userEmbeddings, (embedding) => {
    const lastBetTime = embedding.lastBetTime
    const createdTime = embedding.createdTime
    const lastSeenTime = embedding.lastSeenTime

    return (
      (lastBetTime !== null && lastBetTime >= longAgo) ||
      (lastBetTime === null && createdTime >= longAgo) ||
      lastSeenTime >= longAgo ||
      // Let's update inactive users' feeds once per day
      Math.random() <= 1 / ((24 * 60) / MINUTE_INTERVAL)
    )
  })
}
