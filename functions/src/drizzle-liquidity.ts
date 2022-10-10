import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { CPMMContract } from '../../common/contract'
import { batchedWaitAll } from '../../common/util/promise'
import { APIError } from '../../common/api'
import { addCpmmLiquidity } from '../../common/calculate-cpmm'
import { formatMoney } from '../../common/util/format'

const firestore = admin.firestore()

export const drizzleLiquidity = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async () => {
    const snap = await firestore
      .collection('contracts')
      .where('subsidyPool', '>', 1e-7)
      .get()
    const contractIds = snap.docs.map((doc) => doc.id)

    await batchedWaitAll(
      contractIds.map((cid) => () => drizzleMarket(cid)),
      10
    )
  })

const drizzleMarket = async (contractId: string) => {
  await firestore.runTransaction(async (trans) => {
    const snap = await trans.get(firestore.doc(`contracts/${contractId}`))
    const contract = snap.data() as CPMMContract
    const { subsidyPool, pool, p, slug,  } = contract
    if (subsidyPool ?? 0 < 1e-7) return

    const r = Math.random()
    const amount = subsidyPool <= 1 ? subsidyPool : r * 0.02 * subsidyPool

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
      formatMoney(amount),
      'of',
      formatMoney(subsidyPool),
      'pool to',
      slug
    )
  })
}
