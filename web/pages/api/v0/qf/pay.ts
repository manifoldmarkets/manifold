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
import { QfPaymentTxn } from 'common/txn'
import { User } from 'common/user'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

const schema = z.object({
  qfId: z.string(),
  answerId: z.string(),
  amount: z.number(),
}).strict()

export type QfPayReq = {
  qfId: string
  answerId: string
  amount: number
}

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const userId = await getUserId(req, res)

  const resp = await payAnswer(req, userId)

  return res.status(200).json(resp)
}

async function payAnswer(req: NextApiRequest, userId: string) {
  return await firestore.runTransaction(async (tx) => {
    const { qfId, answerId, amount } = validate(schema, req.body)

    const qf = await safeGet<QuadraticFundingContract>(`contracts/${qfId}`, tx)

    const answer = qf.answers.find((a) => a.id === answerId)
    if (!answer) {
      throw new APIError(404, `Answer not found: ${answerId}`)
    }

    // Verify this user has enough mana to pay for this answer
    const user = await safeGet<User>(`users/${userId}`, tx)
    if (user.balance < amount) {
      throw new APIError(400, `Insufficient mana to pay for answer`)
    }

    // Pay the answer's user
    payUsers(tx, [
      {
        userId: userId,
        payout: -amount,
        deposit: -amount,
      },
      {
        userId: answer.userId,
        payout: amount,
        deposit: amount,
      },
    ])

    // Create a QfPaymentTxn for this answer id, and save it to the txn table
    const qfPaymentTxnDoc = firestore.collection('txns').doc()
    const qfPaymentTxn: QfPaymentTxn = {
      category: 'QF_PAYMENT',
      id: qfPaymentTxnDoc.id,
      qfId,
      createdTime: Date.now(),
      fromType: 'USER',
      fromId: userId,
      toType: 'USER',
      toId: answer.userId,
      token: 'M$',
      amount,
      data: {
        answerId,
      },
    }
    tx.set(qfPaymentTxnDoc, qfPaymentTxn)

    // Commit the transaction and return the result
    return {
      success: true,
    }
  })
}
