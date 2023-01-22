import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Query } from 'firebase-admin/firestore'

import { Contract } from '../../common/contract'
import { loadPaginated, log } from './utils'
import { removeUndefinedProps } from '../../common/util/object'
import { DAY_MS, HOUR_MS } from '../../common/util/time'
import { createSupabaseClient } from './supabase/init'
import { getRecentContractLikes } from './supabase/likes'

export const scoreContracts = functions
  .runWith({ memory: '4GB', timeoutSeconds: 540, secrets: ['SUPABASE_KEY'] })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    await scoreContractsInternal()
  })
const firestore = admin.firestore()

async function scoreContractsInternal() {
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
  const todayLikesByContract = await getRecentContractLikes(db, dayAgo)
  const thisWeekLikesByContract = await getRecentContractLikes(db, weekAgo)

  for (const contract of contracts) {
    const likesToday = todayLikesByContract[contract.id] ?? 0
    const likes7Days = thisWeekLikesByContract[contract.id] ?? 0

    const popularityScore =
      likesToday +
      likes7Days / 10 +
      (contract.uniqueBettors7Days ?? 0) / 10 +
      (contract.uniqueBettors24Hours ?? 0)
    const wasCreatedToday = contract.createdTime > dayAgo

    let dailyScore: number | undefined
    if (
      contract.outcomeType === 'BINARY' &&
      contract.mechanism === 'cpmm-1' &&
      !wasCreatedToday
    ) {
      const percentChange = Math.abs(contract.probChanges.day)
      dailyScore =
        Math.log((contract.uniqueBettors7Days ?? 0) + 1) * percentChange
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
  }
}
