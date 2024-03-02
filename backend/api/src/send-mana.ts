import * as admin from 'firebase-admin'

import { User } from 'common/user'
import { canSendMana, SEND_MANA_REQ } from 'common/manalink'
import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import { createManaPaymentNotification } from 'shared/create-notification'
import * as crypto from 'crypto'
import { createSupabaseClient } from 'shared/supabase/init'
import { isAdminId } from 'common/envs/constants'
import { MAX_COMMENT_LENGTH } from 'common/comment'

export const sendMana: APIHandler<'managram'> = async (props, auth) => {
  const { amount, toIds, message, groupId: passedGroupId } = props
  if (message.length > MAX_COMMENT_LENGTH) {
    throw new APIError(
      400,
      `Message should be less than ${MAX_COMMENT_LENGTH} characters`
    )
  }
  const fromId = auth.uid
  // Run as transaction to prevent race conditions.
  return await firestore.runTransaction(async (transaction) => {
    if (!isAdminId(fromId) && amount < 10) {
      throw new APIError(400, 'Only admins can send less than 10 mana')
    }
    if (toIds.includes(fromId)) {
      throw new APIError(400, 'Cannot send mana to yourself.')
    }
    const fromDoc = firestore.doc(`users/${fromId}`)
    const fromSnap = await transaction.get(fromDoc)
    if (!fromSnap.exists) {
      throw new APIError(404, `User ${fromId} not found`)
    }
    const fromUser = fromSnap.data() as User

    const canCreate = await canSendMana(fromUser, createSupabaseClient())
    if (!canCreate) {
      if (fromUser.isBannedFromPosting || fromUser.userDeleted) {
        throw new APIError(403, 'Your account is banned or deleted.')
      }
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
  })
}

const firestore = admin.firestore()
