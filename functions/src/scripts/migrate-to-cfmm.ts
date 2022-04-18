import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { initAdmin } from './script-init'
initAdmin('stephenDev')

import {
  Binary,
  Contract,
  CPMM,
  DPM,
  FullContract,
} from '../../../common/contract'
import { Bet } from '../../../common/bet'
import {
  calculateDpmPayout,
  getDpmProbability,
} from '../../../common/calculate-dpm'
import { User } from '../../../common/user'
import { getCpmmInitialLiquidity } from '../../../common/antes'
import { noFees } from '../../../common/fees'
import { addObjects } from '../../../common/util/object'

type DocRef = admin.firestore.DocumentReference

const firestore = admin.firestore()

async function recalculateContract(contractRef: DocRef, isCommit = false) {
  await firestore.runTransaction(async (transaction) => {
    const contractDoc = await transaction.get(contractRef)
    const contract = contractDoc.data() as FullContract<DPM, Binary>
    console.log('recalculating', contract.slug)

    if (contract.mechanism !== 'dpm-2' || contract.outcomeType !== 'BINARY') {
      console.log('invalid candidate to port to cfmm')
      return
    }

    const betsRef = contractRef.collection('bets')
    const betDocs = await transaction.get(betsRef)
    const bets = _.sortBy(
      betDocs.docs.map((d) => d.data() as Bet),
      (b) => b.createdTime
    )

    const getSoldBetPayout = (bet: Bet) => {
      const soldBet = bets.find((b) => bet.sale?.betId === b.id)
      return soldBet
        ? -soldBet.amount / Math.sqrt(soldBet.probBefore * soldBet.probAfter)
        : 0
    }

    for (let bet of bets) {
      const shares = bet.sale
        ? getSoldBetPayout(bet)
        : bet.isSold
        ? bet.amount / Math.sqrt(bet.probBefore * bet.probAfter) // make up fake share qty
        : calculateDpmPayout(contract, bet, contract.resolution ?? bet.outcome)

      console.log(
        'converting',
        bet.shares,
        bet.outcome,
        bet.isSold ? '(sold)' : '',
        'shares to',
        shares
      )

      if (isCommit)
        transaction.update(betsRef.doc(bet.id), {
          shares,
          dpmShares: bet.shares,
        })
    }

    const prob =
      contract.resolutionProbability ?? getDpmProbability(contract.totalShares)

    const ante = 100
    const newPool = { YES: ante, NO: ante }
    console.log('creating liquidity pool at p=', prob, 'for M$', ante)

    const contractUpdate: Partial<Contract> = {
      pool: newPool,
      p: prob,
      mechanism: 'cpmm-1',
      totalLiquidity: ante,
      collectedFees: addObjects(contract.collectedFees ?? noFees, noFees),
    }

    const additionalInfo = {
      cfmmConversionTime: Date.now(),
      dpmPool: contract.pool,
    }

    const liquidityDocRef = contractRef.collection('liquidity').doc()

    const lp = getCpmmInitialLiquidity(
      { id: 'IPTOzEqrpkWmEzh6hwvAyY9PqFb2' } as User, // use @ManifoldMarkets' id
      {
        ...contract,
        ...contractUpdate,
      } as FullContract<CPMM, Binary>,
      liquidityDocRef.id,
      ante
    )

    if (isCommit) {
      transaction.update(contractRef, {
        ...contractUpdate,
        ...additionalInfo,
      })
      transaction.set(liquidityDocRef, lp)

      console.log('updated', contract.slug)
    }
  })
}

async function main() {
  const slug = process.argv[2]
  const isCommit = process.argv[3] === 'commit'

  const contractRefs =
    slug === 'all'
      ? await firestore.collection('contracts').listDocuments()
      : await firestore
          .collection('contracts')
          .where('slug', '==', slug)
          .get()
          .then((snap) =>
            !snap.empty ? [firestore.doc(`contracts/${snap.docs[0].id}`)] : []
          )

  for (let contractRef of contractRefs) {
    await recalculateContract(contractRef, isCommit)
    console.log()
    console.log()
  }
}

if (require.main === module) main().then(() => process.exit())
