import * as admin from 'firebase-admin'
import { groupBy, sumBy, mapValues } from 'lodash'

import { initAdmin } from './script-init'
initAdmin()

import { Bet } from '../../../common/bet'
import { Contract } from '../../../common/contract'
import { getLoanPayouts, getPayouts } from '../../../common/payouts'
import { payUser } from '../utils'

type DocRef = admin.firestore.DocumentReference

const firestore = admin.firestore()

async function checkIfPayOutAgain(contractRef: DocRef, contract: Contract) {
  const bets = await contractRef
    .collection('bets')
    .get()
    .then((snap) => snap.docs.map((bet) => bet.data() as Bet))

  const openBets = bets.filter((b) => !b.isSold && !b.sale)

  if (contract.resolution) {
    const { resolution, resolutions, resolutionProbability } = contract as any

    const { payouts } = getPayouts(
      resolution,
      contract,
      openBets,
      [],
      resolutions,
      resolutionProbability
    )

    const loanPayouts = getLoanPayouts(openBets)
    const groups = groupBy(
      [...payouts, ...loanPayouts],
      (payout) => payout.userId
    )
    const userPayouts = mapValues(groups, (group) =>
      sumBy(group, (g) => g.payout)
    )

    console.log('to be paid out', Object.keys(userPayouts).length)
    return { contract, toBePaidOut: userPayouts }
  }
  return undefined
}

async function payOutContractAgain() {
  console.log('Recalculating contract info')

  const snapshot = await firestore
    .collection('contracts')
    .doc('kE59BOOyRb38ezsfoYIW')
    .get()
  const contract = snapshot.data() as Contract

  console.log('Loaded', contract)

  const contractRef = firestore.doc(`contracts/${contract.id}`)
  const result = await checkIfPayOutAgain(contractRef, contract)
  if (result) {
    const { contract, toBePaidOut } = result
    console.log('Contract', contract.id, 'needs to be paid out again')

    for (const [userId, payout] of Object.entries(toBePaidOut)) {
      if (payout > 1e-8) {
        console.log('Subtracting out payout', userId, -payout)
        await payUser(userId, -payout)
      }
    }
  }
}

if (require.main === module) payOutContractAgain().then(() => process.exit())
