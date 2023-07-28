import * as admin from 'firebase-admin'
import { z } from 'zod'

import { User } from 'common/user'
import { canSendMana } from 'common/manalink'
import { APIError, authEndpoint, validate } from './helpers'
import { runTxn, TxnData } from 'shared/txn/run-txn'
import { createManaPaymentNotification } from 'shared/create-notification'
import * as crypto from 'crypto'

const bodySchema = z.object({
  amount: z.number().gt(0).finite(),
  toIds: z.array(z.string()),
  message: z.string(),
})

export const sendmana = authEndpoint(async (req, auth) => {
  const { toIds, message, amount } = validate(bodySchema, req.body)
  const fromId = auth.uid
  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    // Look up the manalink
    const fromDoc = firestore.doc(`users/${fromId}`)
    const fromSnap = await transaction.get(fromDoc)
    if (!fromSnap.exists) {
      throw new APIError(404, `User ${fromId} not found`)
    }
    const fromUser = fromSnap.data() as User

    const canCreate = await canSendMana(fromUser)
    if (!canCreate) {
      throw new APIError(
        401,
        `You don't have at least 1000 mana or your account isn't 1 week old.`
      )
    }

    if (fromUser.balance < amount) {
      throw new APIError(
        400,
        `Insufficient balance: ${fromUser.name} needed ${amount} but only had ${fromUser.balance} `
      )
    }

    const groupId = crypto.randomUUID()
    await Promise.all(
      toIds.map(async (toId) => {
        // Actually execute the txn
        const data: TxnData = {
          fromId: auth.uid,
          fromType: 'USER',
          toId,
          toType: 'USER',
          amount,
          token: 'M$',
          category: 'MANA_PAYMENT',
          data: {
            message,
            groupId,
            visibility: 'public',
          },
          description: `Mana payment ${amount} from ${fromUser.username} to ${auth.uid}`,
        }
        const result = await runTxn(transaction, data)
        const txnId = result.txn?.id
        if (!txnId) {
          throw new APIError(
            500,
            result.message ?? 'An error occurred posting the transaction.'
          )
        }
      })
    )
    await Promise.all(
      toIds.map((toId) =>
        createManaPaymentNotification(fromUser, toId, amount, message)
      )
    )

    return { message: 'Mana sent' }
  })
})

const firestore = admin.firestore()
