import { canSendMana } from 'common/can-send-mana'
import { isAdminId } from 'common/envs/constants'
import { buildArray } from 'common/util/array'
import * as crypto from 'crypto'
import { createManaPaymentNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkIncrementBalances } from 'shared/supabase/users'
import { insertTxns } from 'shared/txn/run-txn'
import { getUser, getUsers } from 'shared/utils'
import { APIError, type APIHandler } from './helpers/endpoint'

import { BURN_MANA_USER_ID } from 'common/economy'
import { betsQueue } from 'shared/helpers/fn-queue'
const IS_PAUSED = false

export const managram: APIHandler<'managram'> = async (props, auth) => {
  const { amount, toIds, message, token, groupId: passedGroupId } = props
  const fromId = auth.uid

  if (IS_PAUSED && !isAdminId(fromId)) {
    throw new APIError(403, 'Managrams are paused')
  }

  if (!isAdminId(fromId) && amount < 10) {
    throw new APIError(403, 'Only admins can send less than 10 mana')
  }
  if (!isAdminId(fromId) && token === 'CASH') {
    throw new APIError(403, 'You cannot send cash.')
  }
  if (toIds.includes(fromId)) {
    throw new APIError(400, 'Cannot send mana to yourself.')
  }

  if (toIds.length <= 0) {
    throw new APIError(400, 'Destination users not found.')
  }

  const pg = createSupabaseDirectClient()

  const fromUser = await betsQueue.enqueueFn(async () => {
    // Run as transaction to prevent race conditions.
    return await pg.tx(async (tx) => {
      const fromUser = await getUser(fromId, tx)
      if (!fromUser) {
        throw new APIError(401, `User ${fromId} not found`)
      }

      const { canSend, message: errorMessage } = await canSendMana(fromUser)
      if (!canSend) {
        throw new APIError(403, errorMessage)
      }

      const total = amount * toIds.length
      const balanceField = token === 'M$' ? 'balance' : 'cashBalance'
      const depositsField =
        token === 'M$' ? 'totalDeposits' : 'totalCashDeposits'
      const balance = fromUser[balanceField]
      if (balance < total) {
        throw new APIError(
          403,
          `Insufficient balance: ${fromUser.name} needed ${
            amount * toIds.length
          } but only had ${balance} `
        )
      }

      const toUsers = await getUsers(toIds, tx)
      if (toUsers.length !== toIds.length) {
        throw new APIError(404, 'Some destination users not found.')
      }
      if (
        token === 'CASH' &&
        toUsers.some((toUser) => !toUser.sweepstakesVerified)
      ) {
        throw new APIError(
          403,
          'All destination users must be sweepstakes verified.'
        )
      }

      await bulkIncrementBalances(
        tx,
        buildArray(
          {
            id: fromId,
            [balanceField]: -total,
            [depositsField]: -total,
          },
          toIds
            .filter((id) => id !== BURN_MANA_USER_ID)
            .map((toId) => ({
              id: toId,
              [balanceField]: amount,
              [depositsField]: amount,
            }))
        )
      )

      const groupId = passedGroupId ? passedGroupId : crypto.randomUUID()

      const txns = toIds.map(
        (toId) =>
          ({
            fromId: auth.uid,
            fromType: 'USER',
            toId,
            toType: 'USER',
            amount,
            token,
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

      return fromUser
    })
  }, [fromId, ...toIds])

  await Promise.all(
    toIds.map((toId) =>
      createManaPaymentNotification(fromUser, toId, amount, message, token)
    )
  )
}
