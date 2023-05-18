import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { getUserId, initAdmin, payUsers, safeGet } from '../_firebase-utils'
import { validate } from '../_validate'
import { QuadraticFundingContract } from 'common/contract'
import { APIError } from 'common/api'
import { QfDividendTxn, QfTxn } from 'common/txn'
import { User } from 'common/user'
import { calculateMatches } from 'common/calculate/qf'
import { sum } from 'lodash'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

const schema = z.object({
  qfId: z.string(),
}).strict()

export type QfResolveReq = {
  qfId: string
}

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })
  const userId = await getUserId(req, res)
  const resp = await addPool(req, userId)
  return res.status(200).json(resp)
}

async function addPool(req: NextApiRequest, userId: string) {
  return await firestore.runTransaction(async (tx) => {
    const { qfId } = validate(schema, req.body)

    const qf = await safeGet<QuadraticFundingContract>(`contracts/${qfId}`, tx)
    const user = await safeGet<User>(`users/${userId}`, tx)
    if (user.id !== qf.creatorId) {
      throw new APIError(400, `Only the owner can resolve the contract`)
    }
    if (qf.resolution) {
      throw new APIError(400, `Contract already resolved`)
    }

    // Get all QFTxns for this contract
    const qfTxnsDocs = await tx.get(
      firestore.collection('txns').where('qfId', '==', qfId)
    )
    const qfTxns = qfTxnsDocs.docs.map((doc) => doc.data() as QfTxn)
    const matches = calculateMatches(qfTxns, qf.pool['M$'])
    const totalMatch = sum(Object.values(matches))
    if (totalMatch > qf.pool['M$']) {
      throw new APIError(
        400,
        `Total match ${totalMatch} exceeds pool ${qf.pool['M$']}`
      )
    }

    let payouts = Object.entries(matches).map(([answerId, match]) => ({
      // In case we can't find the answer creator, pay the contract creator
      userId: qf.answers.find((a) => a.id === answerId)?.userId || qf.creatorId,
      payout: match,
      deposit: match,
    }))
    // Return the remaining pool to the creator
    payouts = [
      ...payouts,
      {
        userId: qf.creatorId,
        payout: qf.pool['M$'] - totalMatch,
        deposit: qf.pool['M$'] - totalMatch,
      },
    ]
    payUsers(tx, payouts)

    // Update the contract to be resolved
    tx.update(firestore.collection('contracts').doc(qfId), {
      [`pool.M$`]: 0,
      isResolved: true,
      resolutionTime: Date.now(),
      resolution: 'MKT',
      resolutions: matches,
    })

    // Create the txns for this dividend
    dividendTxns(tx, qf.id, payouts)

    // Commit the transaction and return the result
    return {
      success: true,
    }
  })
}

function dividendTxns(
  transaction: admin.firestore.Transaction,
  qfId: string,
  payouts: {
    userId: string
    payout: number
  }[]
) {
  payouts.forEach(({ userId, payout }) => {
    const ref = firestore.collection('txns').doc()
    const certDividendTxn: QfDividendTxn = {
      category: 'QF_DIVIDEND',
      id: ref.id,
      qfId: qfId,
      createdTime: Date.now(),
      fromId: qfId,
      fromType: 'CONTRACT',
      toId: userId,
      toType: 'USER',
      token: 'M$',
      amount: payout,
    }
    transaction.set(ref, certDividendTxn)
  })
}
