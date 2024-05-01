import * as admin from 'firebase-admin'

import { isVerified, User } from 'common/user'
import { canSendMana } from 'common/can-send-mana'
import { APIError, type APIHandler } from './helpers/endpoint'
import { insertTxns } from 'shared/txn/run-txn'
import { createManaPaymentNotification } from 'shared/create-notification'
import * as crypto from 'crypto'
import { isAdminId } from 'common/envs/constants'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { getUserPortfolioInternal } from 'shared/get-user-portfolio-internal'
import { createSupabaseDirectClient } from 'shared/supabase/init'

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
  const fromUser = await firestore.runTransaction(async (transaction) => {
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
    if (!isVerified(fromUser)) {
      throw new APIError(403, 'You must verify your phone number to send mana.')
    }

    const { canSend, message: errorMessage } = await canSendMana(fromUser, () =>
      getUserPortfolioInternal(fromUser.id)
    )
    if (!canSend) {
      throw new APIError(403, errorMessage)
    }

    if (toIds.length <= 0) {
      throw new APIError(400, 'Destination users not found.')
    }

    const total = amount * toIds.length
    if (fromUser.balance < total) {
      throw new APIError(
        403,
        `Insufficient balance: ${fromUser.name} needed ${
          amount * toIds.length
        } but only had ${fromUser.balance} `
      )
    }

    const toDocs = await Promise.all(
      toIds.map(async (toId) => {
        const toDoc = firestore.doc(`users/${toId}`)
        const toSnap = await transaction.get(toDoc)
        if (!toSnap.exists) {
          throw new APIError(404, `User ${toId} not found`)
        }
        const user = toSnap.data() as User
        if (!isVerified(user)) {
          throw new APIError(403, 'All destination users must be verified.')
        }
        return toDoc
      })
    )

    transaction.update(fromDoc, {
      balance: admin.firestore.FieldValue.increment(-total),
      totalDeposits: admin.firestore.FieldValue.increment(-total),
    })

    await Promise.all(
      toDocs.map((toDoc) =>
        transaction.update(toDoc, {
          balance: admin.firestore.FieldValue.increment(amount),
          totalDeposits: admin.firestore.FieldValue.increment(amount),
        })
      )
    )

    return fromUser
  })

  const groupId = passedGroupId ? passedGroupId : crypto.randomUUID()
  const pg = createSupabaseDirectClient()

  const txns = toIds.map(
    (toId) =>
      ({
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
        description: message || 'Mana payment',
      } as const)
  )
  await pg.tx((tx) => insertTxns(tx, txns))

  await Promise.all(
    toIds.map((toId) =>
      createManaPaymentNotification(fromUser, toId, amount, message)
    )
  )
}

const firestore = admin.firestore()
