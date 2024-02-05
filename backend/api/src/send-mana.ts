import * as admin from 'firebase-admin'

import { User } from 'common/user'
import { SEND_MANA_REQ } from 'common/manalink'
import { canSendManaDirect } from 'shared/supabase/manalink'
import { APIError, type APIHandler } from './helpers/endpoint'
import { runTxn } from 'shared/txn/run-txn'
import { createManaPaymentNotification } from 'shared/create-notification'
import * as crypto from 'crypto'
import { createSupabaseDirectClient } from 'shared/supabase/init'
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

  if (!isAdminId(fromId) && amount < 10) {
    throw new APIError(400, 'Only admins can send less than 10 mana')
  }
  if (toIds.includes(fromId)) {
    throw new APIError(400, 'Cannot send mana to yourself.')
  }

  if (toIds.length <= 0) {
    throw new APIError(400, 'Destination users not found.')
  }

  const fromDoc = firestore.doc(`users/${fromId}`)
  const fromSnap = await fromDoc.get()
  if (!fromSnap.exists) {
    throw new APIError(404, `User ${fromId} not found`)
  }
  const fromUser = fromSnap.data() as User

  if (fromUser.balance < amount * toIds.length) {
    throw new APIError(
      403,
      `Insufficient balance: ${fromUser.name} needed ${
        amount * toIds.length
      } but only had ${fromUser.balance} `
    )
  }

  const pg = createSupabaseDirectClient()

  const canCreate = await canSendManaDirect(fromUser, pg)
  if (!canCreate) {
    throw new APIError(403, SEND_MANA_REQ)
  }

  const groupId = passedGroupId ? passedGroupId : crypto.randomUUID()

  // It is possible for some of these to fail, but we check from user balance again on every send.
  // This also ensures that if a user is credited, then the txn must have been created
  await Promise.allSettled(
    toIds.map(async (toId) => {
      await pg.tx(async (tx) => {
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

        await runTxn(tx, data)
      })

      createManaPaymentNotification(fromUser, toId, amount, message)
    })
  )
}

const firestore = admin.firestore()
