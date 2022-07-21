import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Bet } from 'common/bet'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'
import { log } from './utils'

export const scoreContracts = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    await scoreContractsInternal()
  })
const firestore = admin.firestore()

async function scoreContractsInternal() {
  const now = Date.now()
  const lastHour = now - 60 * 60 * 1000
  const last3Days = now - 1000 * 60 * 60 * 24 * 3
  const activeContractsSnap = await firestore
    .collection('contracts')
    .where('lastUpdatedTime', '>', lastHour)
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
    const bets = await firestore
      .collection(`contracts/${contract.id}/bets`)
      .where('createdTime', '>', last3Days)
      .get()
    const bettors = bets.docs
      .map((doc) => doc.data() as Bet)
      .map((bet) => bet.userId)
    const score = uniq(bettors).length
    if (contract.popularityScore !== score)
      await firestore
        .collection('contracts')
        .doc(contract.id)
        .update({ popularityScore: score })
  }
}
