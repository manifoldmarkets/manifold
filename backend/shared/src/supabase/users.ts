import { pgp, SupabaseDirectClient } from 'shared/supabase/init'
import { WEEK_MS } from 'common/util/time'
import { APIError } from 'common/api/utils'
import { PrivateUser, User } from 'common/user'
import { FieldValFunction, updateData } from './utils'
import {
  broadcastUpdatedPrivateUser,
  broadcastUpdatedUser,
} from 'shared/websockets/helpers'
import { removeUndefinedProps } from 'common/util/object'
import { getBettingStreakResetTimeBeforeNow } from 'shared/utils'
import { log } from 'node:console'
import { groupBy, mapValues, sumBy } from 'lodash'
import { Row } from 'common/supabase/utils'

// used for API to allow username as parm
export const getUserIdFromUsername = async (
  pg: SupabaseDirectClient,
  username?: string
) => {
  if (!username) return undefined
  const id = await pg.oneOrNone(
    `select id from users where username = $1`,
    [username],
    (r) => r?.id as string
  )
  if (!id) throw new APIError(400, 'No user found with that username')
  return id
}

export const getUserFollowerIds = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const userFollowerIds = await pg.manyOrNone<{ user_id: string }>(
    `select user_id from user_follows where follow_id = $1`,
    [userId]
  )
  return userFollowerIds.map((r) => r.user_id)
}
export const getAllUserIds = async (pg: SupabaseDirectClient) => {
  const userIds = await pg.map(`select id from users`, [], (r) => r.id)
  return userIds
}

export const getWhenToIgnoreUsersTime = () => {
  // Always get the same time a month ago today so postgres can cache the query
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  return today.getTime() - 2 * WEEK_MS
}

export const getMostlyActiveUserIds = async (
  pg: SupabaseDirectClient,
  randomNumberThreshold?: number,
  userIds?: string[]
) => {
  const longAgo = getWhenToIgnoreUsersTime()
  return await pg.map(
    `select id
            from users
            join (
             select ucv.user_id, max(
               greatest(ucv.last_page_view_ts, ucv.last_promoted_view_ts, ucv.last_card_view_ts)
             ) as max_created_time
             from user_contract_views ucv
             group by ucv.user_id
         ) as ucv on id = ucv.user_id
     where (
         ((data->'lastBetTime')::bigint is not null and (data->'lastBetTime')::bigint >= $1) or
         ((data->'lastBetTime')::bigint is null and users.created_time >= $2) or
         (ucv.max_created_time >= $2) or
         ($3 is null or (random() <=  $3))
         )
        and ($4 is null or id = any($4))
       `,
    [longAgo, new Date(longAgo).toISOString(), randomNumberThreshold, userIds],
    (r: { id: string }) => r.id
  )
}

/** Updates user data. Handles name/username as top-level columns automatically.
 *  Do not use for balances — use incrementBalance instead. */
export const updateUser = async (
  db: SupabaseDirectClient,
  id: string,
  update: Partial<User>
) => {
  const { name, username, ...rest } = update

  // name and username are top-level columns, not in the data JSONB.
  // Set them directly so they don't silently land in the wrong place.
  if (name !== undefined || username !== undefined) {
    const setClauses: string[] = []
    const values: any[] = []
    let idx = 1
    if (name !== undefined) {
      setClauses.push(`name = $${idx++}`)
      values.push(name)
    }
    if (username !== undefined) {
      setClauses.push(`username = $${idx++}`)
      values.push(username)
    }
    values.push(id)
    await db.none(
      `update users set ${setClauses.join(', ')} where id = $${idx}`,
      values
    )
  }

  // Update the data JSONB column with everything else
  if (Object.keys(rest).length > 0) {
    await updateData(db, 'users', 'id', { id, ...rest })
  }

  broadcastUpdatedUser({ id, ...update })
}

// private_users has 2 columns that aren't in the data column
export type UpdateType =
  | Partial<PrivateUser>
  | {
      [key in keyof PrivateUser]?: FieldValFunction
    }

export const updatePrivateUser = async (
  db: SupabaseDirectClient,
  id: string,
  update: UpdateType
) => {
  await updateData(db, 'private_users', 'id', { id, ...update })
  broadcastUpdatedPrivateUser(id)
}

export const incrementBalance = async (
  db: SupabaseDirectClient,
  id: string,
  deltas: {
    balance?: number
    cashBalance?: number
    spiceBalance?: number
    totalDeposits?: number
    totalCashDeposits?: number
  }
) => {
  const updates = [
    ['balance', deltas.balance],
    ['cash_balance', deltas.cashBalance],
    ['spice_balance', deltas.spiceBalance],
    ['total_deposits', deltas.totalDeposits],
    ['total_cash_deposits', deltas.totalCashDeposits],
  ].filter(([_, v]) => v) // defined and not 0

  if (updates.length === 0) {
    return
  }

  const result = await db.one(
    `update users set ${updates
      .map(([k, v]) => `${k} = ${k} + ${v}`)
      .join(',')} where id = $1
    returning id, ${updates.map(([k]) => k).join(', ')}`,
    [id]
  )

  broadcastUpdatedUser(
    removeUndefinedProps({
      id,
      balance: result.balance,
      cashBalance: result.cash_balance,
      spiceBalance: result.spice_balance,
      totalDeposits: result.total_deposits,
      totalCashDeposits: result.total_cash_deposits,
    })
  )
}

export const incrementStreakQuery = (user: User, newBetTime: number) => {
  const betStreakResetTime = getBettingStreakResetTimeBeforeNow()

  return pgp.as.format(
    `
    WITH old_data AS (
      SELECT 
        coalesce((data->>'lastBetTime')::bigint, 0) AS lastBetTime,
        coalesce((data->>'currentBettingStreak')::int, 0) AS currentBettingStreak
      FROM users
      WHERE id = $1
    )
    UPDATE users SET 
      data = jsonb_set(
        jsonb_set(data, '{currentBettingStreak}', 
          CASE
            WHEN old_data.lastBetTime < $2
            THEN (old_data.currentBettingStreak + 1)::text::jsonb
            ELSE old_data.currentBettingStreak::text::jsonb
          END
        ),
        '{lastBetTime}', to_jsonb($3)::jsonb
      )
    FROM old_data
    WHERE users.id = $1
    RETURNING 
      CASE
        WHEN old_data.lastBetTime < $2 THEN true
        ELSE false
      END AS streak_incremented
  `,
    [user.id, betStreakResetTime, newBetTime]
  )
}

export const bulkIncrementBalances = async (
  db: SupabaseDirectClient,
  userUpdates: {
    id: string
    balance?: number
    cashBalance?: number
    spiceBalance?: number
    totalDeposits?: number
    totalCashDeposits?: number
  }[]
) => {
  if (userUpdates.length === 0) return
  const query = bulkIncrementBalancesQuery(userUpdates)
  const results = await db.many(query)
  broadcastUserUpdates(results)
}

export type UserUpdate = Pick<
  Row<'users'>,
  | 'id'
  | 'balance'
  | 'cash_balance'
  | 'spice_balance'
  | 'total_deposits'
  | 'total_cash_deposits'
>
export const broadcastUserUpdates = (userUpdates: UserUpdate[]) => {
  for (const row of userUpdates) {
    broadcastUpdatedUser({
      id: row.id,
      balance: row.balance,
      cashBalance: row.cash_balance,
      spiceBalance: row.spice_balance,
      totalDeposits: row.total_deposits,
      totalCashDeposits: row.total_cash_deposits,
    })
  }
}

export const bulkIncrementBalancesQuery = (
  userUpdates: {
    id: string
    balance?: number
    cashBalance?: number
    spiceBalance?: number
    totalDeposits?: number
    totalCashDeposits?: number
  }[]
) => {
  if (userUpdates.length === 0) return 'select 1 where false'

  // Group and sum updates for duplicate user IDs
  const groupedUpdates = groupBy(userUpdates, 'id')
  const summedUpdates = mapValues(groupedUpdates, (updates) => ({
    id: updates[0].id,
    balance: sumBy(updates, 'balance') ?? 0,
    cashBalance: sumBy(updates, 'cashBalance') ?? 0,
    spiceBalance: sumBy(updates, 'spiceBalance') ?? 0,
    totalDeposits: sumBy(updates, 'totalDeposits') ?? 0,
    totalCashDeposits: sumBy(updates, 'totalCashDeposits') ?? 0,
  }))

  const values = Object.values(summedUpdates)
    .map((update) =>
      pgp.as.format(`($1, $2, $3, $4, $5, $6)`, [
        update.id,
        update.balance,
        update.cashBalance,
        update.spiceBalance,
        update.totalDeposits,
        update.totalCashDeposits,
      ])
    )
    .join(',\n')

  return `update users as u
    set
        balance = u.balance + v.balance,
        cash_balance = u.cash_balance + v.cash_balance,
        spice_balance = u.spice_balance + v.spice_balance,
        total_deposits = u.total_deposits + v.total_deposits,
        total_cash_deposits = u.total_cash_deposits + v.total_cash_deposits
    from (values ${values}) as v(id, balance, cash_balance, spice_balance, total_deposits, total_cash_deposits)
    where u.id = v.id
    returning u.id, u.balance, u.cash_balance, u.spice_balance, u.total_deposits, u.total_cash_deposits
    `
}

export const getUserIdFromReferralCode = async (
  pg: SupabaseDirectClient,
  referralCode: string | undefined
) => {
  if (!referralCode) return undefined
  const startOfId = referralCode.replace(/#/g, '0')
  log('startOfId', startOfId)
  return await pg.oneOrNone(
    `select id, coalesce((data->>'sweepstakesVerified')::boolean, false) as sweeps_verified from users
           where id ilike $1 || '%' limit 1`,
    [startOfId],
    (r) =>
      r
        ? {
            id: r.id as string,
            sweepsVerified: r.sweeps_verified as boolean,
          }
        : null
  )
}
export const getReferrerInfo = async (
  pg: SupabaseDirectClient,
  referredByUserId: string | undefined
) => {
  if (!referredByUserId) return undefined
  return await pg.oneOrNone(
    `select id,
       coalesce((data->>'sweepstakesVerified')::boolean, false) as sweeps_verified
       from users where id = $1 
      `,
    [referredByUserId],
    (row) =>
      row
        ? {
            id: row.id as string,
            sweepsVerified: row.sweeps_verified as boolean,
          }
        : null
  )
}
