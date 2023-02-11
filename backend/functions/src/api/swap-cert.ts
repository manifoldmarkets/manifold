import * as admin from 'firebase-admin'
import { APIError, newEndpoint, validate } from './helpers'
import { z } from 'zod'
import { User } from 'common/user'
import { afterSwap } from 'common/calculate/uniswap2'
import { Cert, Uniswap2CertContract } from 'common/contract'
import { buyFromPool } from 'shared/helpers/cert-txns'
import { CertTxn } from 'common/txn'
import { getCertOwnershipUsers } from 'common/calculate/cert'

const bodySchema = z.object({
  certId: z.string(),
  amount: z.number(),
  // Assumes 'M$' for now.
  // token: z.enum(['SHARE', 'M$']),
})

export const swapcert = newEndpoint({}, async (req, auth) => {
  return await firestore.runTransaction(async (transaction) => {
    const { certId, amount } = validate(bodySchema, req.body)

    // Get the cert and the doc
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) {
      throw new APIError(500, `User ${auth.uid} not found`)
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
})
const firestore = admin.firestore()
