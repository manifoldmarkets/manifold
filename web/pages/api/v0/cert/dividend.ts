import {
  CORS_ORIGIN_MANIFOLD,
  CORS_ORIGIN_LOCALHOST,
} from 'common/envs/constants'
import { NextApiRequest, NextApiResponse } from 'next'
import { applyCorsHeaders } from 'web/lib/api/cors'
import * as admin from 'firebase-admin'
import { z } from 'zod'
import { getUserId, initAdmin, payUsers } from '../_firebase-utils'
import { validate } from '../_validate'
import { Uniswap2CertContract } from 'common/contract'
import { APIError } from 'common/api'
import { getDividendPayouts } from 'common/calculate/cert'
import { CertDividendTxn, CertTxn } from 'common/txn'
import { User } from 'common/lib/user'
import { formatMoney } from 'common/util/format'

export const config = { api: { bodyParser: true } }

initAdmin()
const firestore = admin.firestore()

// Split "amount" of mana between all holders of the cert.
const schema = z.object({
  certId: z.string(),
  amount: z.number(),
})
export type DividendCertReq = {
  certId: string
  amount: number
}

export default async function route(req: NextApiRequest, res: NextApiResponse) {
  await applyCorsHeaders(req, res, {
    origin: [CORS_ORIGIN_MANIFOLD, CORS_ORIGIN_LOCALHOST],
    methods: 'POST',
  })

  const userId = await getUserId(req, res)

  const resp = await dividend(req, userId)

  return res.status(200).json(resp)
}

const dividend = async (req: NextApiRequest, userId: string) => {
  return await firestore.runTransaction(async (transaction) => {
    const { certId, amount } = validate(schema, req.body)

    // Get the cert, the provider, and all txns
    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) {
      throw new APIError(500, `User ${userId} not found`)
    }
    const provider = userSnap.data() as User

    const certDoc = firestore.doc(`contracts/${certId}`)
    const certSnap = await transaction.get(certDoc)
    if (!certSnap.exists) {
      throw new APIError(500, `Cert ${certId} not found`)
    }
    const cert = certSnap.data() as Uniswap2CertContract
    // For now, only allow cert creator to pay dividends
    if (cert.creatorId !== provider.id) {
      throw new APIError(
        500,
        `User ${provider.id} is not the creator of cert ${certId}`
      )
    }
    const txnsSnap = await firestore
      .collection('txns')
      .where('certId', '==', certId)
      .orderBy('createdTime', 'desc')
      .get()
    const txns = txnsSnap.docs.map((doc) => doc.data()) as CertTxn[]

    const payouts = getDividendPayouts(provider.id, amount, txns)

    // If the provider's balance would go negative, abort here
    const providerPayout = payouts.find((p) => p.userId === provider.id)?.payout
    if (!providerPayout) {
      throw new APIError(500, `Provider ${provider.id} must own a cert share`)
    }
    if (provider.balance + providerPayout < 0) {
      throw new APIError(500, `Insufficient balance; needed ${-providerPayout}`)
    }

    // Update user balances; assumes <249 owners of a cert
    // See `resolve-markets.ts` for a more robust solution
    payUsers(transaction, payouts)
    // Also create the associated dividend txns
    const payoutsWithoutProvider = payouts.filter(
      (p) => p.userId !== provider.id
    )
    dividendTxns(transaction, userId, certId, payoutsWithoutProvider)

    return {
      payouts,
    }
  })
}

function dividendTxns(
  transaction: admin.firestore.Transaction,
  providerId: string,
  certId: string,
  payouts: {
    userId: string
    payout: number
  }[]
) {
  // Create one CertDividend for each recipient
  payouts.forEach(({ userId, payout }) => {
    const ref = firestore.collection('txns').doc()
    const certDividendTxn: CertDividendTxn = {
      category: 'CERT_DIVIDEND',
      id: ref.id,
      certId: certId,
      createdTime: Date.now(),
      fromId: providerId,
      fromType: 'USER',
      toId: userId,
      toType: 'USER',
      token: 'M$',
      amount: payout,
      description: `USER/${providerId} paid ${formatMoney(
        payout
      )} dividend to USER/${userId}`,
    }
    transaction.set(ref, certDividendTxn)
  })
}
