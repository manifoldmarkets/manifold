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
        .update(removeUndefinedProps({ popularityScore, dailyScore }))
    }

    contractScoreUpdates.push({
      contract_id: contract.id,
      freshness_score: freshnessScore,
    })
  }

  log('performing bulk update of freshness scores', contractScoreUpdates.length)
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

  if (contract.mechanism === 'cpmm-1' && !wasCreatedToday) {
    const { prob, probChanges } = contract
    const yesterdayProb = clamp(prob - probChanges.day, 0.01, 0.99)
    const todayProb = clamp(prob, 0.01, 0.99)
    const logOddsChange = Math.abs(logit(yesterdayProb) - logit(todayProb))
    dailyScore = Math.log(thisWeekScore + 1) * logOddsChange
  }

  return {
    todayScore,
    thisWeekScore,
    popularityScore,
    freshnessScore,
    dailyScore,
  }
}