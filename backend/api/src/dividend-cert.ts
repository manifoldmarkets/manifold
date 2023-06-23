import * as admin from 'firebase-admin'
import { APIError, authEndpoint, validate } from './helpers'
import { z } from 'zod'
import { User } from 'common/user'
import { getDividendPayouts } from 'common/calculate/cert'
import { Uniswap2CertContract } from 'common/contract'
import { dividendTxns } from 'shared/helpers/cert-txns'
import { CertTxn } from 'common/txn'
import { payUsers } from 'shared/utils'

// Split "amount" of mana between all holders of the cert.
const bodySchema = z.object({
  certId: z.string(),
  amount: z.number(),
})

export const dividendcert = authEndpoint(async (req, auth) => {
  return await firestore.runTransaction(async (transaction) => {
    const { certId, amount } = validate(bodySchema, req.body)

    // Get the cert, the provider, and all txns
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) {
      throw new APIError(500, `User ${auth.uid} not found`)
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
    // See `resolve-questions.ts` for a more robust solution
    payUsers(transaction, payouts)
    // Also create the associated dividend txns
    const payoutsWithoutProvider = payouts.filter(
      (p) => p.userId !== provider.id
    )
    dividendTxns(transaction, auth.uid, certId, payoutsWithoutProvider)

    return {
      payouts,
    }
  })
})
const firestore = admin.firestore()
