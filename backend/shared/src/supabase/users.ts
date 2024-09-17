import {
  pgp,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { WEEK_MS } from 'common/util/time'
import { APIError } from 'common/api/utils'
import { User } from 'common/user'
import { DataUpdate, updateData } from './utils'
import {
  broadcastUpdatedUser,
  broadcastUpdatedPrivateUser,
} from 'shared/websockets/helpers'
import { removeUndefinedProps } from 'common/util/object'
import { getBettingStreakResetTimeBeforeNow } from 'shared/utils'

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

/** only updates data column. do not use for name, username, or balances */
export const updateUser = async (
  db: SupabaseDirectClient,
  id: string,
  update: Partial<User>
) => {
  const fullUpdate = { id, ...update }
  await updateData(db, 'users', 'id', fullUpdate)
  broadcastUpdatedUser(fullUpdate)
}

export const updatePrivateUser = async (
  db: SupabaseDirectClient,
  id: string,
  update: DataUpdate<'private_users'>
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

export const incrementStreak = async (
  tx: SupabaseTransaction,
  user: User,
  newBetTime: number
) => {
  const betStreakResetTime = getBettingStreakResetTimeBeforeNow()

  const incremented = await tx.one(
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
    [user.id, betStreakResetTime, newBetTime],
    (r) => r.streak_incremented
  )

  broadcastUpdatedUser(
    removeUndefinedProps({
      id: user.id,
      currentBettingStreak: incremented
        ? (user?.currentBettingStreak ?? 0) + 1
        : undefined,
      lastBetTime: newBetTime,
    })
  )

  return incremented
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

  const values = userUpdates
    .map((update) =>
      pgp.as.format(`($1, $2, $3, $4, $5, $6)`, [
        update.id,
        update.balance ?? 0,
        update.cashBalance ?? 0,
        update.spiceBalance ?? 0,
        update.totalDeposits ?? 0,
        update.totalCashDeposits ?? 0,
      ])
    )
    .join(',\n')

  const results = await db.many(`update users as u
    set
        balance = u.balance + v.balance,
        cash_balance = u.cash_balance + v.cash_balance,
        spice_balance = u.spice_balance + v.spice_balance,
        total_deposits = u.total_deposits + v.total_deposits,
        total_cash_deposits = u.total_cash_deposits + v.total_cash_deposits
    from (values ${values}) as v(id, balance, cash_balance, spice_balance, total_deposits, total_cash_deposits)
    where u.id = v.id
    returning u.id, u.balance, u.cash_balance, u.spice_balance, u.total_deposits, u.total_cash_deposits
  `)

  for (const row of results) {
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
