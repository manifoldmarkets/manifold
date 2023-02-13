import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { CPMMContract } from 'common/contract'
import { mapAsync } from 'common/util/promise'
import { APIError } from 'common/api'
import { addCpmmLiquidity } from 'common/calculate-cpmm'
import { formatMoneyWithDecimals } from 'common/util/format'

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
    const contract = snap.data() as CPMMContract
    const { subsidyPool, pool, p, slug, popularityScore } = contract
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const logPopularity = Math.log10((popularityScore ?? 0) + 10)
    const v = Math.max(1, Math.min(4, logPopularity))
    const amount = subsidyPool <= 1 ? subsidyPool : r * v * 0.2 * subsidyPool

    const { newPool, newP } = addCpmmLiquidity(pool, p, amount)

    if (!isFinite(newP)) {
      throw new APIError(
        500,
        'Liquidity injection rejected due to overflow error.'
      )
    }

    await trans.update(firestore.doc(`contracts/${contract.id}`), {
      pool: newPool,
      p: newP,
      subsidyPool: subsidyPool - amount,
    })

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
