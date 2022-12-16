import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { getUserId, initAdmin } from '../_firebase-utils'
import { validate } from '../_validate'
import { Cert, Uniswap2CertContract } from 'common/contract'
import { APIError } from 'common/api'
import { getCertOwnershipUsers } from 'common/calculate/cert'
import { CertTxn } from 'common/txn'
import { User } from 'common/lib/user'
import { buyFromPool } from './_cert-txns'
import { afterSwap } from 'common/calculate/uniswap2'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

// Split "amount" of mana between all holders of the cert.
const schema = z.object({
  certId: z.string(),
  amount: z.number(),
  // Assumes 'M$' for now.
  // token: z.enum(['SHARE', 'M$']),
})
export type SwapCertReq = {
  certId: string
  amount: number
}

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const userId = await getUserId(req, res)

  const resp = await swap(req, userId)

  return res.status(200).json(resp)
}

const swap = async (req: NextApiRequest, userId: string) => {
  return await firestore.runTransaction(async (transaction) => {
    const { certId, amount } = validate(schema, req.body)

    // Get the cert and the doc
    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) {
      throw new APIError(500, `User ${userId} not found`)
    }
    const user = userSnap.data() as User

    const certDoc = firestore.doc(`contracts/${certId}`)
    const certSnap = await transaction.get(certDoc)
    if (!certSnap.exists) {
      throw new APIError(500, `Cert ${certId} not found`)
    }
    const cert = certSnap.data() as Uniswap2CertContract

    // Ensure that the user has enough mana left; then update the user doc
    const newBalance = user.balance - amount
    if (newBalance < 0) {
      throw new APIError(500, `Insufficient balance`)
    }
    transaction.update(userDoc, { balance: newBalance })

    // Recalculate the pool and update the cert doc
    const newPool = afterSwap(cert.pool, 'M$', amount)
    transaction.update(certDoc, {
      pool: newPool,
      lastUpdatedTime: Date.now(),
      lastBetTime: Date.now(),
    } as Partial<Cert>)

    const sharesFromPool = cert.pool['SHARE'] - newPool['SHARE']

    // Right now, we support negative values in the amount to sell shares
    // TODO: Not sure if we should support negative balances in CertTxn...
    const txnsSnap = await firestore
      .collection('txns')
      .where('certId', '==', certId)
      .orderBy('createdTime', 'desc')
      .get()
    const txns = txnsSnap.docs.map((doc) => doc.data()) as CertTxn[]
    const owners = getCertOwnershipUsers(cert.creatorId, txns)
    // If negative sharesSold (aka adding shares to pool), make sure the user has enough
    const sharesOwned = owners[user.id] ?? 0
    if (sharesFromPool < 0 && sharesOwned < -sharesFromPool) {
      throw new APIError(
        500,
        `Insufficient shares: needed ${-sharesFromPool} but had ${
          owners[user.id]
        }`
      )
    }

    // Create the two txns for this swap
    buyFromPool(user.id, cert.id, sharesFromPool, amount, transaction)

    return {
      newPool: newPool,
    }
  })
}
