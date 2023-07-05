import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { mapAsync } from 'common/util/promise'
import { APIError } from 'common/api'
import {
  addCpmmLiquidity,
  addCpmmMultiLiquidity,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { formatMoneyWithDecimals } from 'common/util/format'
import { Answer } from 'common/answer'

const firestore = admin.firestore()

export const drizzleLiquidity = async () => {
  const snap = await firestore
    .collection('contracts')
    .where('subsidyPool', '>', 1e-7)
    .get()

  const contractIds = snap.docs.map((doc) => doc.id)
  console.log('found', contractIds.length, 'markets to drizzle')
  console.log()

  await mapAsync(contractIds, (cid) => drizzleMarket(cid), 10)
}

export const drizzleLiquidityScheduler = functions.pubsub
  .schedule('*/10 * * * *')
  .onRun(drizzleLiquidity)

const drizzleMarket = async (contractId: string) => {
  await firestore.runTransaction(async (trans) => {
    const snap = await trans.get(firestore.doc(`contracts/${contractId}`))
    const contract = snap.data() as CPMMContract | CPMMMultiContract
    const { subsidyPool, slug } = contract
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const amount = subsidyPool <= 1 ? subsidyPool : r * 0.3 * subsidyPool

    if (contract.mechanism === 'cpmm-multi-1') {
      const answersSnap = await trans.get(
        firestore.collection(`contracts/${contractId}/answersCpmm`)
      )
      const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
      const poolsByAnswer = Object.fromEntries(
        answers.map((a) => [a.id, { YES: a.poolYes, NO: a.poolNo }])
      )
      const newPools = addCpmmMultiLiquidity(poolsByAnswer, amount)

      for (const [answerId, newPool] of Object.entries(newPools)) {
        trans.update(
          firestore.doc(`contracts/${contract.id}/answersCpmm/${answerId}`),
          {
            poolYes: newPool.YES,
            poolNo: newPool.NO,
            prob: getCpmmProbability(newPool, 0.5),
          }
        )
      }
      trans.update(firestore.doc(`contracts/${contract.id}`), {
        subsidyPool: subsidyPool - amount,
      })
    } else {
      const { pool, p } = contract
      const { newPool, newP } = addCpmmLiquidity(pool, p, amount)

      if (!isFinite(newP)) {
        throw new APIError(
          500,
          'Liquidity injection rejected due to overflow error.'
        )
      }

      trans.update(firestore.doc(`contracts/${contract.id}`), {
        pool: newPool,
        p: newP,
        subsidyPool: subsidyPool - amount,
      })
    }

    console.log(
      'added subsidy',
      formatMoneyWithDecimals(amount),
      'of',
      formatMoneyWithDecimals(subsidyPool),
      'pool to',
      slug
    )
    console.log()
  })
}
