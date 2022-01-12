import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { Bet } from '../../../common/bet'
import { getProbability } from '../../../common/calculate'
import { Contract } from '../../../common/contract'

type DocRef = admin.firestore.DocumentReference

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// const serviceAccount = require('../../../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')
const serviceAccount = require('../../../../../../Downloads/mantic-markets-firebase-adminsdk-1ep46-351a65eca3.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
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
