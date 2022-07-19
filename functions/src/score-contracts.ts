import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { Bet } from 'common/bet'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'

export const scoreContracts = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    await scoreContractsInternal()
  })
const firestore = admin.firestore()

async function scoreContractsInternal() {
  const now = Date.now()
  const lastHour = now - 3600000
  const last3Days = now - 2592000000

  const contracts = await firestore
    .collection('contracts')
    .where('lastUpdatedTime', '>', lastHour)
    .get()

  for (const contractSnap of contracts.docs) {
    const contract = contractSnap.data() as Contract
    const contractId = contractSnap.id
    const bets = await firestore
      .collection(`contracts/${contractId}/bets`)
      .where('createdTime', '>', last3Days)
      .get()
    const bettors = bets.docs
      .map((doc) => doc.data() as Bet)
      .map((bet) => bet.userId)
    const score = uniq(bettors).length
    if (contract.popularityScore !== score)
      await firestore
        .collection('contracts')
        .doc(contractId)
        .update({ popularityScore: score })
  }
}
