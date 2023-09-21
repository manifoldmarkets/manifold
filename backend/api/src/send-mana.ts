import * as admin from 'firebase-admin'
import { z } from 'zod'

import { User } from 'common/user'
import { canSendMana, SEND_MANA_REQ } from 'common/manalink'
import { APIError, authEndpoint, validate } from './helpers'
import { runTxn, TxnData } from 'shared/txn/run-txn'
import { createManaPaymentNotification } from 'shared/create-notification'
import * as crypto from 'crypto'
import { createSupabaseClient } from 'shared/supabase/init'
import { MAX_ID_LENGTH } from 'common/group'
import { isAdminId } from 'common/envs/constants'

const bodySchema = z.object({
  amount: z.number().finite(),
  toIds: z.array(z.string()),
  message: z.string(),
  groupId: z.string().max(MAX_ID_LENGTH).optional(),
})

export const sendmana = authEndpoint(async (req, auth) => {
  const {
    toIds,
    message,
    amount,
    groupId: passedGroupId,
  } = validate(bodySchema, req.body)
  const fromId = auth.uid
  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    if (!isAdminId(fromId) && amount < 0) {
      throw new APIError(400, 'Only admins can fine users')
    }
    const fromDoc = firestore.doc(`users/${fromId}`)
    const fromSnap = await transaction.get(fromDoc)
    if (!fromSnap.exists) {
      throw new APIError(404, `User ${fromId} not found`)
    }
    const fromUser = fromSnap.data() as User

    const canCreate = await canSendMana(fromUser, createSupabaseClient())
    if (!canCreate) {
      throw new APIError(403, SEND_MANA_REQ)
    }

    if (toIds.length <= 0) {
      throw new APIError(400, 'Destination users not found.')
    }
    if (fromUser.balance < amount * toIds.length) {
      throw new APIError(
        403,
        `Insufficient balance: ${fromUser.name} needed ${
          amount * toIds.length
        } but only had ${fromUser.balance} `
      )
    }

    const groupId = passedGroupId ? passedGroupId : crypto.randomUUID()
    await Promise.all(
      toIds.map(async (toId) => {
        const data = {
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
        } as const
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
