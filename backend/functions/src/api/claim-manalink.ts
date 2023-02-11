import * as admin from 'firebase-admin'
import { z } from 'zod'

import { User } from 'common/user'
import { canCreateManalink, Manalink } from 'common/manalink'
import { APIError, newEndpoint, validate } from './api'
import { runTxn, TxnData } from 'shared/run-txn'

const bodySchema = z.object({
  slug: z.string(),
})

export const claimmanalink = newEndpoint({}, async (req, auth) => {
  const { slug } = validate(bodySchema, req.body)

  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    // Look up the manalink
    const manalinkDoc = firestore.doc(`manalinks/${slug}`)
    const manalinkSnap = await transaction.get(manalinkDoc)
    if (!manalinkSnap.exists) {
      throw new APIError(400, 'Manalink not found')
    }
    const manalink = manalinkSnap.data() as Manalink

    const { amount, fromId, claimedUserIds } = manalink

    if (amount <= 0 || isNaN(amount) || !isFinite(amount))
      throw new APIError(500, 'Invalid amount')

    if (auth.uid === fromId)
      throw new APIError(400, `You can't claim your own manalink`)

    const fromDoc = firestore.doc(`users/${fromId}`)
    const fromSnap = await transaction.get(fromDoc)
    if (!fromSnap.exists) {
      throw new APIError(500, `User ${fromId} not found`)
    }
    const fromUser = fromSnap.data() as User

    if (!canCreateManalink(fromUser)) {
      throw new APIError(
        400,
        `@${fromUser.username} is not authorized to create manalinks.`
      )
    }

    // Only permit one redemption per user per link
    if (claimedUserIds.includes(auth.uid)) {
      throw new APIError(400, `You already redeemed manalink ${slug}`)
    }

    // Disallow expired or maxed out links
    if (manalink.expiresTime != null && manalink.expiresTime < Date.now()) {
      throw new APIError(
        400,
        `Manalink ${slug} expired on ${new Date(
          manalink.expiresTime
        ).toLocaleString()}`
      )
    }
    if (
      manalink.maxUses != null &&
      manalink.maxUses <= manalink.claims.length
    ) {
      throw new APIError(
        400,
        `Manalink ${slug} has reached its max uses of ${manalink.maxUses}`
      )
    }

    if (fromUser.balance < amount) {
      throw new APIError(
        400,
        `Insufficient balance: ${fromUser.name} needed ${amount} for this manalink but only had ${fromUser.balance} `
      )
    }

    // Actually execute the txn
    const data: TxnData = {
      fromId,
      fromType: 'USER',
      toId: auth.uid,
      toType: 'USER',
      amount,
      token: 'M$',
      category: 'MANALINK',
      description: `Manalink ${slug} claimed: ${amount} from ${fromUser.username} to ${auth.uid}`,
    }
    const result = await runTxn(transaction, data)
    const txnId = result.txn?.id
    if (!txnId) {
      throw new APIError(
        500,
        result.message ?? 'An error occurred posting the transaction.'
      )
    }

    // Update the manalink object with this info
    const claim = {
      toId: auth.uid,
      txnId,
      claimedTime: Date.now(),
    }
    transaction.update(manalinkDoc, {
      claimedUserIds: [...claimedUserIds, auth.uid],
      claims: [...manalink.claims, claim],
    })

    return { message: 'Manalink claimed' }
  })
})

const firestore = admin.firestore()
