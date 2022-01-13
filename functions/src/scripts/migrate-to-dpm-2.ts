import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { Contract } from '../../../common/contract'
import { Bet } from '../../../common/bet'
import { calculateShares, getProbability } from '../../../common/calculate'
import { getSellBetInfo } from '../../../common/sell-bet'
import { User } from '../../../common/user'

type DocRef = admin.firestore.DocumentReference

// Generate your own private key, and set the path below:
// https://console.firebase.google.com/u/0/project/mantic-markets/settings/serviceaccounts/adminsdk
// const serviceAccount = require('../../../../../../Downloads/dev-mantic-markets-firebase-adminsdk-sir5m-b2d27f8970.json')
const serviceAccount = require('../../../../../../Downloads/mantic-markets-firebase-adminsdk-1ep46-351a65eca3.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})
const firestore = admin.firestore()

async function recalculateContract(contractRef: DocRef, contract: Contract) {
  const startPool = (contract as any).startPool as
    | undefined
    | { YES: number; NO: number }

  if (!startPool) return

  console.log('recalculating', contract.slug)

  await firestore.runTransaction(async (transaction) => {
    const contractDoc = await transaction.get(contractRef)
    const contract = contractDoc.data() as Contract

    const betDocs = await transaction.get(contractRef.collection('bets'))
    const bets = _.sortBy(
      betDocs.docs.map((d) => d.data() as Bet),
      (b) => b.createdTime
    )

    const phantomAnte = startPool.YES + startPool.NO

    const leftovers =
      _.sumBy(bets, (b) => b.amount) -
      _.sumBy(bets, (b) => {
        if (!b.sale) return b.amount
        const soldBet = bets.find((bet) => bet.id === b.sale?.betId)
        return soldBet?.amount || 0
      })
    const poolTotal = contract.pool.YES + contract.pool.NO
    const prevTotalBets = contract.totalBets.YES + contract.totalBets.NO
    const calculatedrealAnte = poolTotal - prevTotalBets - leftovers

    const realAnte = Math.max(
      0,
      (contract as any).realAnte || calculatedrealAnte
    )

    if (!(contract as any).realAnte)
      transaction.update(contractRef, {
        realAnte,
      })

    console.log(
      'pool',
      poolTotal,
      'phantomAnte',
      phantomAnte,
      'realAnte',
      realAnte,
      'calculatedRealAnte',
      calculatedrealAnte,
      'leftovers',
      leftovers
    )

    let p = startPool.YES ** 2 / (startPool.YES ** 2 + startPool.NO ** 2)

    const phantomShares = {
      YES: Math.sqrt(p) * phantomAnte,
      NO: Math.sqrt(1 - p) * phantomAnte,
    }

    let totalShares = {
      YES: Math.sqrt(p) * (phantomAnte + realAnte),
      NO: Math.sqrt(1 - p) * (phantomAnte + realAnte),
    }

    let pool = { YES: p * realAnte, NO: (1 - p) * realAnte }

    let totalBets = { YES: p * realAnte, NO: (1 - p) * realAnte }

    const betsRef = contractRef.collection('bets')

    console.log('start', { pool, totalBets, totalShares })

    for (let bet of bets) {
      if (bet.sale) {
        const soldBet = bets.find((b) => b.id === bet.sale?.betId)
        if (!soldBet) throw new Error('invalid sold bet' + bet.sale.betId)

        const fakeUser = { id: soldBet.userId, balance: 0 } as User

        const fakeContract: Contract = {
          ...contract,
          totalBets,
          totalShares,
          pool,
          phantomShares,
        }

        const { newBet, newPool, newTotalShares, newTotalBets } =
          getSellBetInfo(fakeUser, soldBet, fakeContract, bet.id)

        newBet.createdTime = bet.createdTime
        // console.log('sale bet', newBet)
        transaction.update(betsRef.doc(bet.id), newBet)

        pool = newPool
        totalShares = newTotalShares
        totalBets = newTotalBets

        continue
      }

      const shares = calculateShares(totalShares, bet.amount, bet.outcome)
      const probBefore = p
      const ind = bet.outcome === 'YES' ? 1 : 0

      totalShares = {
        YES: totalShares.YES + ind * shares,
        NO: totalShares.NO + (1 - ind) * shares,
      }

      pool = {
        YES: pool.YES + ind * bet.amount,
        NO: pool.NO + (1 - ind) * bet.amount,
      }

      totalBets = {
        YES: totalBets.YES + ind * bet.amount,
        NO: totalBets.NO + (1 - ind) * bet.amount,
      }

      p = getProbability(totalShares)

      const probAfter = p

      const betUpdate: Partial<Bet> = {
        shares,
        probBefore,
        probAfter,
      }

      // console.log('bet', betUpdate)
      // console.log('update', { pool, totalBets, totalShares })

      transaction.update(betsRef.doc(bet.id), betUpdate)
    }

    const contractUpdate: Partial<Contract> = {
      pool,
      totalBets,
      totalShares,
      phantomShares,
    }

    console.log('final', contractUpdate)
    transaction.update(contractRef, contractUpdate)
  })

  console.log('updated', contract.slug)
  console.log()
  console.log()
}

async function recalculateContractTotals() {
  console.log('Migrating ante calculations to DPM-2')

  const snapshot = await firestore.collection('contracts').get()
  const contracts = snapshot.docs.map((doc) => doc.data() as Contract)

  console.log('Loaded', contracts.length, 'contracts')

  for (const contract of contracts) {
    // if (contract.slug !== 'will-polymarket-list-any-new-market') continue
    const contractRef = firestore.doc(`contracts/${contract.id}`)

    await recalculateContract(contractRef, contract)
  }
}

if (require.main === module)
  recalculateContractTotals().then(() => process.exit())
