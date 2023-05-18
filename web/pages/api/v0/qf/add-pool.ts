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
import { QfAddPoolTxn } from 'common/txn'
import { User } from 'common/user'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

const schema = z.object({
  qfId: z.string(),
  amount: z.number(),
}).strict()

export type QfAddPoolReq = {
  qfId: string
  amount: number
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
    const { qfId, amount } = validate(schema, req.body)

    const qf = await safeGet<QuadraticFundingContract>(`contracts/${qfId}`, tx)
    // Verify this user has enough mana to pay for this answer
    const user = await safeGet<User>(`users/${userId}`, tx)
    if (user.balance < amount) {
      throw new APIError(400, `Insufficient mana to pay for answer`)
    }

    // Deduct balance from user
    payUsers(tx, [
      {
        userId: userId,
        payout: -amount,
        deposit: -amount,
      },
    ])

    // Update pool.M$ on the qf contract
    tx.update(firestore.collection('contracts').doc(qfId), {
      [`pool.M$`]: qf.pool['M$'] + amount,
    })

    // Create a txn to mark the transfer
    const txnDoc = firestore.collection('txns').doc()
    const txn: QfAddPoolTxn = {
      category: 'QF_ADD_POOL',
      id: txnDoc.id,
      qfId,
      createdTime: Date.now(),
      fromType: 'USER',
      fromId: userId,
      toType: 'CONTRACT',
      toId: qfId,
      token: 'M$',
      amount,
    }
    tx.set(txnDoc, txn)

    // Commit the transaction and return the result
    return {
      success: true,
    }
  })
}
