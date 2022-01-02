import * as admin from 'firebase-admin'
import * as _ from 'lodash'
import { Bet } from '../types/bet'
import { Contract } from '../types/contract'

type DocRef = admin.firestore.DocumentReference

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
const serviceAccount = require('../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
const firestore = admin.firestore()

async function recalculateContract(contractRef: DocRef, contract: Contract) {
  const bets = await contractRef
    .collection('bets')
    .get()
    .then((snap) => snap.docs.map((bet) => bet.data() as Bet))

  const openBets = bets.filter((b) => !b.isSold && !b.sale)

  const totalShares = {
    YES: _.sumBy(openBets, (bet) => (bet.outcome === 'YES' ? bet.shares : 0)),
    NO: _.sumBy(openBets, (bet) => (bet.outcome === 'NO' ? bet.shares : 0)),
  }

  const totalBets = {
    YES: _.sumBy(openBets, (bet) => (bet.outcome === 'YES' ? bet.amount : 0)),
    NO: _.sumBy(openBets, (bet) => (bet.outcome === 'NO' ? bet.amount : 0)),
  }

  await contractRef.update({ totalShares, totalBets })

  console.log(
    'calculating totals for "',
    contract.question,
    '" total bets:',
    totalBets
  )
  console.log()
}

async function recalculateContractTotals() {
  console.log('Recalculating contract info')

  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    await recalculateContract(contractRef, contract)
  }
}

if (require.main === module)
  recalculateContractTotals().then(() => process.exit())
