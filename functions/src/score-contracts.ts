import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Contract } from '../../common/contract'
import { log } from './utils'
import { removeUndefinedProps } from '../../common/util/object'
import { DAY_MS, HOUR_MS } from '../../common/util/time'

export const scoreContracts = functions
  .runWith({ memory: '4GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    await scoreContractsInternal()
  })
const firestore = admin.firestore()

async function scoreContractsInternal() {
  const now = Date.now()
  const hourAgo = now - HOUR_MS
  const dayAgo = now - DAY_MS
  const activeContractsSnap = await firestore
    .collection('contracts')
    .where('lastUpdatedTime', '>', hourAgo)
    .get()
  const activeContracts = activeContractsSnap.docs.map(
    (doc) => doc.data() as Contract
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

  for (const contract of contracts) {
    const popularityScore = contract.uniqueBettors7Days ?? 1
    const wasCreatedToday = contract.createdTime > dayAgo

    let dailyScore: number | undefined
    if (
      contract.outcomeType === 'BINARY' &&
      contract.mechanism === 'cpmm-1' &&
      !wasCreatedToday
    ) {
      const percentChange = Math.abs(contract.probChanges.day)
      dailyScore = popularityScore * percentChange
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
