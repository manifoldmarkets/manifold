import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { initAdmin } from './script-init'
initAdmin('stephen')

import { Bet } from '../../../common/bet'
import { getProbability } from '../../../common/calculate-dpm'
import { Contract } from '../../../common/contract'

type DocRef = admin.firestore.DocumentReference
const firestore = admin.firestore()

async function migrateContract(contractRef: DocRef, contract: Contract) {
  const bets = await contractRef
    .collection('bets')
    .get()
    .then((snap) => snap.docs.map((bet) => bet.data() as Bet))

  const lastBet = _.sortBy(bets, (bet) => -bet.createdTime)[0]
  if (lastBet) {
    const probAfter = getProbability(contract.totalShares)

    await firestore
      .doc(`contracts/${contract.id}/bets/${lastBet.id}`)
      .update({ probAfter })

    console.log('updating last bet from', lastBet.probAfter, 'to', probAfter)
  }
}

async function migrateContracts() {
  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded contracts', contracts.length)

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    console.log('contract', contract.question)

    await migrateContract(contractRef, contract)
  }
}

if (require.main === module) migrateContracts().then(() => process.exit())
