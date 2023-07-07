import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { mapAsync } from 'common/util/promise'
import { APIError } from 'common/api'
import {
  addCpmmLiquidity,
  addCpmmLiquidityFixedP,
  addCpmmMultiLiquidity,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { formatMoneyWithDecimals } from 'common/util/format'
import { Answer } from 'common/answer'
import { FieldValue } from 'firebase-admin/firestore'

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

  const answersSnap = await firestore
    .collectionGroup('answersCpmm')
    .where('subsidyPool', '>', 1e-7)
    .get()

  const answers = answersSnap.docs.map((doc) => doc.data() as Answer)
  console.log('found', answers.length, 'answers to drizzle')
  console.log()

  await mapAsync(
    answers,
    (answer) => drizzleAnswer(answer.contractId, answer.id),
    10
  )
}

export const drizzleLiquidityScheduler = functions.pubsub
  .schedule('*/10 * * * *')
  .onRun(drizzleLiquidity)

const drizzleMarket = async (contractId: string) => {
  await firestore.runTransaction(async (trans) => {
    const snap = await trans.get(firestore.doc(`contracts/${contractId}`))
    const contract = snap.data() as CPMMContract | CPMMMultiContract
    const { subsidyPool, slug, popularityScore } = contract
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const logPopularity = Math.log10((popularityScore ?? 0) + 10)
    const v = Math.max(1, Math.min(4, logPopularity))
    const amount = subsidyPool <= 1 ? subsidyPool : r * v * 0.2 * subsidyPool

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

const drizzleAnswer = async (contractId: string, answerId: string) => {
  await firestore.runTransaction(async (trans) => {
    const answerDoc = firestore.doc(
      `contracts/${contractId}/answersCpmm/${answerId}`
    )
    const answerSnap = await trans.get(answerDoc)
    const answer = answerSnap.data() as Answer
    const { subsidyPool, poolYes, poolNo } = answer
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const amount = subsidyPool <= 1 ? subsidyPool : r * 0.4 * subsidyPool

    const pool = { YES: poolYes, NO: poolNo }
    const { newPool } = addCpmmLiquidityFixedP(pool, amount)

    if (!isFinite(newPool.YES) || !isFinite(newPool.NO)) {
      throw new APIError(
        500,
        'Liquidity injection rejected due to overflow error.'
      )
    }

    trans.update(answerDoc, {
      poolYes: newPool.YES,
      poolNo: newPool.NO,
      prob: getCpmmProbability(newPool, 0.5),
      subsidyPool: FieldValue.increment(-amount),
    })

    console.log(
      'added subsidy',
      newPool.YES - pool.YES,
      'YES and',
      newPool.NO - pool.NO,
      'NO:',
      formatMoneyWithDecimals(amount),
      'of',
      formatMoneyWithDecimals(subsidyPool),
      'pool to',
      answer.text
    )
    console.log()
  })
}
