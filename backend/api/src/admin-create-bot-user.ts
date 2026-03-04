import * as crypto from 'crypto'

import { APIError, APIHandler } from './helpers/endpoint'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insert } from 'shared/supabase/utils'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { STARTING_BALANCE } from 'common/economy'
import { cleanDisplayName } from 'common/util/clean-username'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { RESERVED_PATHS } from 'common/envs/constants'
import { SignupBonusTxn } from 'common/txn'

export const adminCreateBotUser: APIHandler<'admin-create-bot-user'> = async (
  body,
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)

  const { username, displayName: rawDisplayName, startingBalance } = body
  const displayName = cleanDisplayName(rawDisplayName)

  if (!/^[A-Za-z0-9_]+$/.test(username)) {
    throw new APIError(
      400,
      'Username must only contain letters, numbers, and underscores'
    )
  }

  if (RESERVED_PATHS.includes(username.toLowerCase())) {
    throw new APIError(400, 'Username is reserved')
  }

  const pg = createSupabaseDirectClient()

  const existingUser = await pg.oneOrNone(
    `select id from users where username ilike $1`,
    [username]
  )
  if (existingUser) {
    throw new APIError(400, 'Username already taken')
  }

  const userId = crypto.randomUUID()
  const apiKey = crypto.randomUUID()
  const email = `${username}@bot.internal`

  await pg.tx(async (tx) => {
    await insert(tx, 'users', {
      id: userId,
      name: displayName,
      username,
      data: {
        id: userId,
        shouldShowWelcome: false,
        streakForgiveness: 0,
        creatorTraders: { daily: 0, weekly: 0, monthly: 0, allTime: 0 },
        signupBonusPaid: 0,
      },
    })

    await insert(tx, 'private_users', {
      id: userId,
      data: {
        id: userId,
        email,
        apiKey,
        notificationPreferences: getDefaultNotificationPreferences(),
        blockedUserIds: [],
        blockedByUserIds: [],
        blockedContractIds: [],
        blockedGroupSlugs: [],
      },
    })

    const signupBonusTxn: Omit<
      SignupBonusTxn,
      'id' | 'createdTime' | 'fromId'
    > = {
      fromType: 'BANK',
      toId: userId,
      toType: 'USER',
      amount: startingBalance ?? STARTING_BALANCE,
      token: 'M$',
      category: 'SIGNUP_BONUS',
      description: 'Signup bonus',
    }
    await runTxnFromBank(tx, signupBonusTxn)
  })

  return { userId, username, apiKey }
}
