import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Query } from 'firebase-admin/firestore'

import { Contract } from 'common/contract'
import { loadPaginated, log } from 'shared/utils'
import { removeUndefinedProps } from 'common/util/object'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getRecentContractLikes } from 'shared/supabase/likes'
import { logit } from 'common/util/math'
import { bulkUpdate } from 'shared/supabase/utils'

export const scoreContracts = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets: ['SUPABASE_KEY', 'SUPABASE_PASSWORD'],
  })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    await scoreContractsInternal()
  })
const firestore = admin.firestore()

export async function scoreContractsInternal() {
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
  const previouslyActiveContractsSnap = await firestore
    .collection('contracts')
    .where('popularityScore', '>', 0)
    .get()
  const activeContractIds = activeContracts.map((c) => c.id)
  const previouslyActiveContracts = previouslyActiveContractsSnap.docs
    .map((doc) => doc.data() as Contract)
    .filter((c) => !activeContractIds.includes(c.id))

  const contracts = activeContracts.concat(previouslyActiveContracts)
  log(`Found ${contracts.length} contracts to score`)

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const contractScoreUpdates: {
    contract_id: string
    freshness_score: number
  }[] = []

  const todayLikesByContract = await getRecentContractLikes(db, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(db, weekAgo)

  for (const contract of contracts) {
    const todayScore =
      (todayLikesByContract[contract.id] ?? 0) +
      (contract.uniqueBettors24Hours ?? 0)
    const thisWeekScore =
      (thisWeekLikesByContract[contract.id] ?? 0) +
      (contract.uniqueBettors7Days ?? 0)

    const popularityScore = todayScore + thisWeekScore / 10
    const freshnessScore = 1 + Math.log(1 + popularityScore)
    const wasCreatedToday = contract.createdTime > dayAgo

    let dailyScore: number | undefined
    if (
      contract.outcomeType === 'BINARY' &&
      contract.mechanism === 'cpmm-1' &&
      !wasCreatedToday
    ) {
      const { prob, probChanges } = contract
      const logOddsChange = Math.abs(
        logit(prob + probChanges.day) - logit(prob)
      )
      dailyScore = Math.log(thisWeekScore + 1) * logOddsChange
    }

    if (
      contract.popularityScore !== popularityScore ||
      contract.dailyScore !== dailyScore
    ) {
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

  console.log(
    'performing bulk update of freshness scores',
    contractScoreUpdates.length
  )
  return await bulkUpdate(
    pg,
    'contract_recommendation_features',
    'contract_id',
    contractScoreUpdates
  )
}
