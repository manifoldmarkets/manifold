
import { isVerified } from 'common/user'
import { canSendMana } from 'common/can-send-mana'
import { APIError, type APIHandler } from './helpers/endpoint'
import { insertTxns } from 'shared/txn/run-txn'
import { createManaPaymentNotification } from 'shared/create-notification'
import * as crypto from 'crypto'
import { isAdminId } from 'common/envs/constants'
import { MAX_COMMENT_LENGTH } from 'common/comment'
import { getUserPortfolioInternal } from 'shared/get-user-portfolio-internal'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getUsers } from 'shared/utils'
import { bulkIncrementBalances } from 'shared/supabase/users'
import { buildArray } from 'common/util/array'

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
    throw new APIError(403, 'Only admins can send less than 10 mana')
  }
  if (toIds.includes(fromId)) {
    throw new APIError(400, 'Cannot send mana to yourself.')
  }

  if (toIds.length <= 0) {
    throw new APIError(400, 'Destination users not found.')
  }

  const pg = createSupabaseDirectClient()

  // Run as transaction to prevent race conditions.
  const fromUser = await pg.tx(async (tx) => {
    const fromUser = await getUser(fromId, tx)
    if (!fromUser) {
      throw new APIError(401, `User ${fromId} not found`)
    }

    if (!isVerified(fromUser)) {
      throw new APIError(403, 'You must verify your phone number to send mana.')
    }

    const { canSend, message: errorMessage } = await canSendMana(fromUser, () =>
      getUserPortfolioInternal(fromUser.id)
    )
    if (!canSend) {
      throw new APIError(403, errorMessage)
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

    const toUsers = await getUsers(toIds, tx)
    if (toUsers.length !== toIds.length) {
      throw new APIError(404, 'Some destination users not found.')
    }
    if (toUsers.some((toUser) => !isVerified(toUser))) {
      throw new APIError(403, 'All destination users must be verified.')
    }

    await bulkIncrementBalances(
      tx,
      buildArray(
        {
          id: fromId,
          balance: -total,
          totalDeposits: -total,
        },
        toIds.map((toId) => ({
          id: toId,
          balance: amount,
          totalDeposits: amount,
        }))
      )
    )

    return fromUser
  })

  const groupId = passedGroupId ? passedGroupId : crypto.randomUUID()

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
