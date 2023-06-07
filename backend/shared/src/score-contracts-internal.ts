import { SupabaseDirectClient } from 'shared/supabase/init'
import { SupabaseClient } from 'common/supabase/utils'
import { DAY_MS, HOUR_MS } from 'common/util/time'
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

export async function scoreContractsInternal(
  firestore: FirebaseFirestore.Firestore,
  db: SupabaseClient,
  pg: SupabaseDirectClient
) {
  const now = Date.now()
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const activeContracts = await loadPaginated(
    firestore
      .collection('contracts')
      .where('lastUpdatedTime', '>', hourAgo) as Query<Contract>
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
  const thisWeekTradersByContract = await getContractTraders(pg, weekAgo)

  for (const contract of contracts) {
    const todayScore =
      (todayLikesByContract[contract.id] ?? 0) +
      (todayTradersByContract[contract.id] ?? 0)
    const thisWeekScore =
      (thisWeekLikesByContract[contract.id] ?? 0) +
      (thisWeekTradersByContract[contract.id] ?? 0)

    const popularityScore = todayScore + thisWeekScore / 10
    const freshnessScore = 1 + Math.log(1 + popularityScore)
    const wasCreatedToday = contract.createdTime > dayAgo

    let dailyScore = 0
    if (
      contract.outcomeType === 'BINARY' &&
      contract.mechanism === 'cpmm-1' &&
      !wasCreatedToday
    ) {
      const { prob, probChanges } = contract
      const yesterdayProb = clamp(prob - probChanges.day, 0.01, 0.99)
      const todayProb = clamp(prob, 0.01, 0.99)
      const logOddsChange = Math.abs(logit(yesterdayProb) - logit(todayProb))
      dailyScore = Math.log(thisWeekScore + 1) * logOddsChange
    }

    if (
      contract.popularityScore !== popularityScore ||
      contract.dailyScore !== dailyScore
    ) {
      // If it's just undergone a large prob change, add it to the feed
      if (dailyScore > 1.5 && dailyScore - contract.dailyScore > 1) {
        await insertMarketMovementContractToUsersFeeds(contract, dailyScore)
      }
      // If it's fairly popular and had 3 new traders in the past hour, add it to the feed
      if (
        popularityScore > 5 &&
        popularityScore - contract.popularityScore > 3
      ) {
        await insertTrendingContractToUsersFeeds(contract, popularityScore)
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
