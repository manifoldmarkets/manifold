import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Query } from 'firebase-admin/firestore'
import { clamp } from 'lodash'

import { Contract } from 'common/contract'
import { loadPaginated, log } from 'shared/utils'
import { removeUndefinedProps } from 'common/util/object'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import {
  SupabaseDirectClient,
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getRecentContractLikes } from 'shared/supabase/likes'
import { logit } from 'common/util/math'
import { bulkUpdate } from 'shared/supabase/utils'
import { secrets } from 'common/secrets'
import { addContractToFeed } from 'shared/create-feed'
import { buildArray } from 'common/util/array'

export const scoreContracts = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    await scoreContractsInternal()
  })
const firestore = admin.firestore()

const getContractTraders = async (pg: SupabaseDirectClient, since: number) => {
  return Object.fromEntries(
    await pg.map(
      `select contract_id, count(distinct user_id)::int as n
      from contract_bets
      where created_time >= millis_to_ts($1)
      group by contract_id`,
      [since],
      (r) => [r.contract_id as string, r.n as number]
    )
  )
}

export async function scoreContractsInternal() {
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
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
      if (dailyScore > 1 && Math.abs(dailyScore - contract.dailyScore) > 1) {
        log(
          'adding contract to feed',
          contract.id,
          'with daily score',
          dailyScore
        )
        // TODO: should we store the probability change in the feed item's data column?
        await addContractToFeed(
          contract,
          buildArray([
            !contract.isResolved && 'follow_contract',
            'liked_contract',
            'viewed_contract',
            'similar_interest_vector_to_contract',
          ]),
          'contract_probability_changed'
        )
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
    'contract_id',
    contractScoreUpdates
  )
}
