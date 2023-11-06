import * as express from 'express'
import * as admin from 'firebase-admin'
import { log } from 'shared/utils'
import { CONFIGS } from 'common/envs/constants'
import { MINUTE_MS, HOUR_MS, DAY_MS } from 'common/util/time'
import { delay } from 'common/util/promise'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getInstanceHostname, tsToMillis } from 'common/supabase/utils'
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
} from 'shared/importance-score'
import {
  UserEmbeddingDetails,
  userInterestEmbeddings,
} from 'shared/supabase/vectors'
import { Dictionary, pickBy } from 'lodash'
import { getWhenToIgnoreUsersTime } from 'shared/supabase/users'
import { DEFAULT_FEED_USER_ID } from 'common/feed'

let RUN_INTERVAL_MS = 30 * MINUTE_MS
let EMBEDDINGS_UPDATE_MS = 5 * MINUTE_MS
let EMBEDDINGS_FULL_REFRESH_MS = 60 * MINUTE_MS

let LAST_RUN_TS = 0
let LAST_RUN_DURATION_MS = 0
let LAST_EMBEDDINGS_UPDATED_TS = 0
let LAST_EMBEDDINGS_FULL_REFRESH_TS = 0

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080
const ENV = process.env.ENVIRONMENT ?? 'DEV'
const CONFIG = CONFIGS[ENV]
if (CONFIG == null) {
  throw new Error(`process.env.ENVIRONMENT = ${ENV} - should be DEV or PROD.`)
}

const SUPABASE_INSTANCE_ID = CONFIG.supabaseInstanceId
if (!SUPABASE_INSTANCE_ID) {
  throw new Error(`Can't connect to Supabase; no instance ID set for ${ENV}.`)
}

const SUPABASE_PASSWORD = process.env.SUPABASE_PASSWORD
if (!SUPABASE_PASSWORD) {
  throw new Error(
    `Can't connect to Supabase; no process.env.SUPABASE_PASSWORD.`
  )
}

const SUPABASE_KEY = process.env.SUPABASE_KEY
if (!SUPABASE_KEY) {
  throw new Error(
    `Can't connect to Supabase; no process.env.SUPABASE_KEY.`
  )
}

const firestore = admin.initializeApp().firestore()
const db = createSupabaseClient(SUPABASE_INSTANCE_ID, SUPABASE_KEY)
const pg = createSupabaseDirectClient(SUPABASE_INSTANCE_ID, SUPABASE_PASSWORD)

const app = express()
app.use(express.json())

app.get('/', async (_req, res) => {
  return res.status(200).json({
    running: true,
    last_run_ts: LAST_RUN_TS ? new Date(LAST_RUN_TS).toISOString() : null,
    last_run_duration_ms: LAST_RUN_DURATION_MS,
    last_embeddings_updated_ts: LAST_EMBEDDINGS_UPDATED_TS
      ? new Date(LAST_EMBEDDINGS_UPDATED_TS).toISOString()
      : null,
    last_embeddings_full_refresh_ts: LAST_EMBEDDINGS_FULL_REFRESH_TS
      ? new Date(LAST_EMBEDDINGS_FULL_REFRESH_TS).toISOString()
      : null,
  })
})

const server = app.listen(PORT, async () => {
  log('INFO', `Running in ${ENV} environment listening on port ${PORT}.`)
  process.on('SIGTERM', async () => {
    log('INFO', 'Shutting down.')
    await new Promise((resolve) => server.close(resolve))
    process.exit(0)
  })
  while (true) {
    LAST_RUN_TS = Date.now()
    log('Starting feed population iteration.')
    await addInterestingContractsToFeed(LAST_RUN_TS)
    LAST_RUN_DURATION_MS = Date.now() - LAST_RUN_TS;

    const breakTimeMs = RUN_INTERVAL_MS - LAST_RUN_DURATION_MS
    if (breakTimeMs > 0) {
      log(`Done with feed population. Restarting in ${breakTimeMs / 1000}s.`)
      // mqp -- if we do a giant setTimeout GCR might kill our instance, so
      // break it up so that it knows we are awake
      for (let i = 0; i < breakTimeMs / 1000; i++) {
        await delay(1000)
      }
    } else {
      log('Done with feed population. Restarting immediately.')
    }
  }
})

async function addInterestingContractsToFeed(startTime: number, readOnly = false) {
  const contracts = await pg.map(
    `select data, importance_score from contracts
            where importance_score >= 0.225
            order by importance_score desc
            `,
    [],
    (r: any) => ({ ...r.data, importanceScore: r.importance_score } as Contract)
  )
  log(`Found ${contracts.length} contracts to add to feed`)

  const contractIds = contracts.map((c) => c.id)
  const hourAgo = startTime - HOUR_MS
  const dayAgo = startTime - DAY_MS
  const weekAgo = startTime - 7 * DAY_MS
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
    await updateStoredUserEmbeddings()
    const { todayScore, logOddsChange, thisWeekScore, importanceScore } =
      computeContractScores(
        startTime,
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
      await insertTrendingContractToUsersFeeds(
        contract,
        startTime - 5 * DAY_MS,
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
      log(
        'Inserting generally trending, recently popular contract',
        contract.id,
        'with importance score',
        importanceScore,
        'and',
        hourAgoTradersByContract[contract.id],
        'traders in the past hour'
      )
      await insertTrendingContractToUsersFeeds(
        contract,
        startTime - 14 * DAY_MS,
        {
          tradersInPastHour: hourAgoTradersByContract[contract.id] ?? 0,
          importanceScore: parseFloat(importanceScore.toPrecision(2)),
        },
        'old'
      )
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
}

const getUserEmbeddingDetails = async (
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
    (row: any) => {
      const interest = JSON.parse(row.interest_embedding) as number[]
      const disinterest = row.disinterest_embedding
        ? (JSON.parse(row.disinterest_embedding) as number[])
        : null
      const lastBetTime = row.last_bet_time
      const createdTime = tsToMillis(row.created_time)
      const lastSeenTime =
        row.last_seen_time == 0 ? tsToMillis(row.created_time) : row.last_seen_time

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

const updateStoredUserEmbeddings = async () => {
  const now = Date.now()
  const fullRefresh =
    LAST_EMBEDDINGS_FULL_REFRESH_TS + EMBEDDINGS_FULL_REFRESH_MS < now
  const partialRefresh =
    LAST_EMBEDDINGS_UPDATED_TS + EMBEDDINGS_UPDATE_MS < now
  if (fullRefresh) {
    log("Fully refreshing user embedding details.")
    LAST_EMBEDDINGS_FULL_REFRESH_TS = now
    LAST_EMBEDDINGS_UPDATED_TS = now
  } else if (partialRefresh) {
    LAST_EMBEDDINGS_UPDATED_TS = now
    log("Updating details for new user embeddings.")
  } else {
    // don't need to update right now
    return
  }
  const since = fullRefresh ? 0 : now - EMBEDDINGS_UPDATE_MS
  const newUserInterestEmbeddings = await getUserEmbeddingDetails(since)
  log(`Fetched ${Object.keys(newUserInterestEmbeddings).length} embeddings.`)
  Object.entries(
    filterUserEmbeddings(newUserInterestEmbeddings, getWhenToIgnoreUsersTime())
  ).forEach(([userId, user]) => {
    userInterestEmbeddings[userId] = user
  })

  if (!newUserInterestEmbeddings[DEFAULT_FEED_USER_ID]) {
    const defaultUser = await getUserEmbeddingDetails(0, DEFAULT_FEED_USER_ID)
    userInterestEmbeddings[DEFAULT_FEED_USER_ID] =
      defaultUser[DEFAULT_FEED_USER_ID]
  }
}

const filterUserEmbeddings = (
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
      Math.random() <= 1 / (DAY_MS / RUN_INTERVAL_MS)
    )
  })
}
