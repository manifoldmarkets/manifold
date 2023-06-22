import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient } from 'common/supabase/utils'
import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { loadPaginated, log } from 'shared/utils'
import { Query } from 'firebase-admin/lib/firestore'
import { Contract } from 'common/contract'
import { getRecentContractLikes } from 'shared/supabase/likes'
import { clamp } from 'lodash'
import { logit } from 'common/util/math'
import {
  insertMarketMovementContractToUsersFeeds,
  insertTrendingContractToUsersFeeds,
} from 'shared/create-feed'
import { removeUndefinedProps } from 'common/util/object'
import { bulkUpdate } from 'shared/supabase/utils'
import { BOT_USERNAMES } from 'common/envs/constants'

export const MINUTE_INTERVAL = 15

export async function scoreContractsInternal(
  firestore: FirebaseFirestore.Firestore,
  db: SupabaseClient,
  pg: SupabaseDirectClient
) {
  const now = Date.now()
  const lastUpdatedTime = now - MINUTE_INTERVAL * MINUTE_MS
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS

  const activeContracts = await loadPaginated(
    firestore
      .collection('contracts')
      .where('lastUpdatedTime', '>', lastUpdatedTime) as Query<Contract>
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContractsData = await db
    .from('contracts')
    .select('data')
    .or('data->>dailyScore.gt.0,popularity_score.gt.0')

  const activeContractIds = activeContracts.map((c) => c.id)
  const previouslyActiveContracts = (previouslyActiveContractsData.data ?? [])
    .map((row) => row.data as Contract)
    .filter((c) => !activeContractIds.includes(c.id))

  const contracts = activeContracts.concat(previouslyActiveContracts)
  log(`Found ${contracts.length} contracts to score`)

  const contractScoreUpdates: {
    contract_id: string
    freshness_score: number
  }[] = []

  const todayLikesByContract = await getRecentContractLikes(db, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(db, weekAgo)
  const todayTradersByContract = await getContractTraders(pg, dayAgo)
  const hourAgoTradersByContract = await getContractTraders(pg, hourAgo)
  const thisWeekTradersByContract = await getContractTraders(pg, weekAgo)

  for (const contract of contracts) {
    const {
      todayScore,
      thisWeekScore,
      popularityScore,
      freshnessScore,
      dailyScore,
      importanceScore,
    } = computeContractScores(
      now,
      contract,
      todayLikesByContract[contract.id] ?? 0,
      thisWeekLikesByContract[contract.id] ?? 0,
      todayTradersByContract[contract.id] ?? 0,
      hourAgoTradersByContract[contract.id] ?? 0,
      thisWeekTradersByContract[contract.id] ?? 0
    )

    // This is a newly trending contract, and should be at the top of most users' feeds
    if (todayScore > 10 && todayScore / thisWeekScore > 0.5) {
      log('inserting specifically today trending contract', contract.id)
      await insertTrendingContractToUsersFeeds(contract, now - 2 * DAY_MS, {
        todayScore,
        thisWeekScore,
      })
    }
    // If it's already popular but has had 5 new traders in the past hour, add it to the feed
    else if (
      popularityScore > 20 &&
      hourAgoTradersByContract[contract.id] > 5
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
      })
    }

    if (
      contract.popularityScore !== popularityScore ||
      contract.dailyScore !== dailyScore
    ) {
      // If it's just undergone a large prob change, add it to the feed
      if (dailyScore > 1.5 && dailyScore - contract.dailyScore > 1) {
        await insertMarketMovementContractToUsersFeeds(contract, dailyScore)
      }
      await firestore
        .collection('contracts')
        .doc(contract.id)
        .update(
          removeUndefinedProps({ popularityScore, dailyScore, importanceScore })
        )
    }

    contractScoreUpdates.push({
      contract_id: contract.id,
      freshness_score: freshnessScore,
    })
  }

  // log('performing bulk update of freshness scores', contractScoreUpdates.length)
  return await bulkUpdate(
    pg,
    'contract_recommendation_features',
    ['contract_id'],
    contractScoreUpdates
  )
}

const getContractTraders = async (pg: SupabaseDirectClient, since: number) => {
  return Object.fromEntries(
    await pg.map(
      `select cb.contract_id, count(distinct cb.user_id)::int as n
       from contract_bets cb
                join users u on cb.user_id = u.id
       where cb.created_time >= millis_to_ts($1)
         and u.username <> ANY(ARRAY[$2])
       group by cb.contract_id`,
      [since, BOT_USERNAMES],
      (r) => [r.contract_id as string, r.n as number]
    )
  )
}

export async function testScoreContractsInternal(
  firestore: FirebaseFirestore.Firestore,
  db: SupabaseClient,
  pg: SupabaseDirectClient
) {
  const now = Date.now()
  const lastUpdatedTime = now - MINUTE_INTERVAL * MINUTE_MS
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS

  const activeContracts = await loadPaginated(
    firestore
      .collection('contracts')
      .where('lastUpdatedTime', '>', lastUpdatedTime) as Query<Contract>
  )
  // We have to downgrade previously active contracts to allow the new ones to bubble up
  const previouslyActiveContractsData = await db
    .from('contracts')
    .select('data')
    .or('data->>dailyScore.gt.0,popularity_score.gt.0')

  const activeContractIds = activeContracts.map((c) => c.id)
  const previouslyActiveContracts = (previouslyActiveContractsData.data ?? [])
    .map((row) => row.data as Contract)
    .filter((c) => !activeContractIds.includes(c.id))

  const contracts = activeContracts.concat(previouslyActiveContracts)
  log(`Found ${contracts.length} contracts to score`)

  const todayLikesByContract = await getRecentContractLikes(db, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(db, weekAgo)
  const todayTradersByContract = await getContractTraders(pg, dayAgo)
  const hourAgoTradersByContract = await getContractTraders(pg, hourAgo)
  const thisWeekTradersByContract = await getContractTraders(pg, weekAgo)

  const scores: [number, Contract][] = []

  for (const contract of contracts) {
    const { importanceScore } = computeContractScores(
      now,
      contract,
      todayLikesByContract[contract.id] ?? 0,
      thisWeekLikesByContract[contract.id] ?? 0,
      todayTradersByContract[contract.id] ?? 0,
      hourAgoTradersByContract[contract.id] ?? 0,
      thisWeekTradersByContract[contract.id] ?? 0
    )

    scores.push([importanceScore, contract])
  }

  if (scores.filter(([s]) => s < 0 || s > 1).length !== 0)
    console.log('WARNING: some scores are out of bounds')

  console.log('Top 50 contracts by score')
  scores
    .sort((a, b) => b[0] - a[0])
    .slice(0, 50)
    .forEach(([score, contract]) => {
      console.log(score, contract.question)
    })

  console.log('Bottom 5 contracts by score')
  scores
    .sort((a, b) => a[0] - b[0])
    .slice(0, 5)
    .forEach(([score, contract]) => {
      console.log(score, contract.question)
    })
}

const computeContractScores = (
  now: number,
  contract: Contract,
  likesToday: number,
  likesWeek: number,
  tradersToday: number,
  traderHour: number,
  tradersWeek: number
) => {
  const todayScore = likesToday + tradersToday
  const thisWeekScore = likesWeek + tradersWeek
  const thisWeekScoreWeight = thisWeekScore / 10
  const popularityScore = todayScore + thisWeekScoreWeight
  const freshnessScore = 1 + Math.log(1 + popularityScore)
  const wasCreatedToday = contract.createdTime > now - DAY_MS

  let dailyScore = 0
  let logOddsChange = 0

  if (contract.mechanism === 'cpmm-1' && !wasCreatedToday) {
    const { prob, probChanges } = contract
    const yesterdayProb = clamp(prob - probChanges.day, 0.01, 0.99)
    const todayProb = clamp(prob, 0.01, 0.99)
    logOddsChange = Math.abs(logit(yesterdayProb) - logit(todayProb))
    dailyScore = Math.log(thisWeekScore + 1) * logOddsChange
  }

  const newness = wasCreatedToday
    ? normalize(24 - (now - contract.createdTime) / (1000 * 60 * 60), 24)
    : 0

  const { closeTime } = contract

  const closingSoonnness =
    closeTime && closeTime > now && closeTime - now < 1000 * 60 * 60 * 24
      ? normalize(24 - (closeTime - now) / (1000 * 60 * 60), 24)
      : 0

  const liquidityScore = normalize(clamp(1 / contract.elasticity, 0, 100), 100)

  // recalibrate all of these numbers as site usage changes
  const rawImportance =
    3 * normalize(logOddsChange, 5) +
    3 * newness +
    2 * normalize(traderHour, 20) +
    2 * normalize(todayScore, 100) +
    normalize(thisWeekScore, 200) +
    normalize(Math.log10(contract.volume24Hours), 5) +
    normalize(contract.uniqueBettorCount, 1000) +
    normalize(Math.log10(contract.volume), 7) +
    liquidityScore +
    closingSoonnness

  const importanceScore = normalize(rawImportance, 6)

  return {
    todayScore,
    thisWeekScore,
    popularityScore,
    freshnessScore,
    dailyScore,
    importanceScore,
  }
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

const normalize = (x: number, max: number) => sigmoid((6 * x) / max - 3)
