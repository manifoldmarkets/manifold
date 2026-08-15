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
import { getStreakDayStart } from 'common/streak'
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
  const { name, username, isBot, ...rest } = update

  // name, username, and is_bot are top-level columns, not in the data JSONB.
  // Set them directly so they don't silently land in the wrong place.
  if (name !== undefined || username !== undefined || isBot !== undefined) {
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
    if (isBot !== undefined) {
      setClauses.push(`is_bot = $${idx++}`)
      values.push(isBot)
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

// Record a completed mana purchase on the user row: mark them a purchaser and,
// if they have no bonusEligibility yet, promote them to 'eligible' (bonuses
// without prizes). Monotonic — only promotes from an unset state, so it never
// overrides 'verified'/'grandfathered'/'ineligible'/'requires_verification' and
// never downgrades anyone. Deliberately leaves prizeEligibility untouched (a
// purchase never unlocks cash raffles) and never pays the signup/referral lump
// sum (that stays on the KYC path). Shared by the Stripe and Daimo purchase
// webhooks so the promotion rule has a single source of truth.
export const recordManaPurchase = async (
  tx: SupabaseDirectClient,
  userId: string
) => {
  const row = await tx.oneOrNone<{ bonusEligibility: string | null }>(
    `select data->>'bonusEligibility' as "bonusEligibility"
       from users where id = $1`,
    [userId]
  )
  await updateUser(tx, userId, {
    purchasedMana: true,
    ...(row?.bonusEligibility ? {} : { bonusEligibility: 'eligible' as const }),
  })
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

// The single writer of currentBettingStreak increments and lastBetTime.
// See the streak-qualifying-activity invariant below before adding callers
// or judging streak activity anywhere else.
export const incrementStreakQuery = (user: User, newBetTime: number) => {
  // The boundary of the bet's OWN Pacific day, so a bet stamped just before
  // midnight but processed just after it still counts for the day it belongs
  // to (Date.now() here would judge it against the wrong day).
  const betStreakResetTime = getStreakDayStart(newBetTime)

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

/**
 * THE STREAK-QUALIFYING-ACTIVITY INVARIANT
 *
 * Every action that advances a betting streak runs incrementStreakQuery
 * above, and nothing else does:
 *   - executed bets and sells, API included: place-bet's executeNewBetResult
 *     runs it in-transaction for every CandidateBet it commits
 *   - perp opens/adds/closes: advancePerpBettingStreak
 *     (backend/api/src/helpers/perp-streak.ts)
 * and it stamps lastBetTime unconditionally as it runs. lastBetTime is
 * therefore the time of the user's last streak-qualifying action, and any
 * consumer that needs "has the user acted since <boundary>" can read the
 * scalar directly — the streak expiry notice job and the web streak modal
 * do exactly that.
 *
 * NOT qualifying (incrementStreakQuery never runs on their path): unfilled
 * limit orders (place-bet returns early with streakIncremented: false),
 * maker fills, redemptions, and forced perp exits (liquidation / ADL /
 * market resolution).
 *
 * The one question the scalar cannot answer is "was there an action inside
 * a CLOSED day [start, end)" for a user who has acted since `end` — the
 * later action overwrote the evidence. The fragment below is the
 * table-level twin of the invariant for exactly that case; the nightly
 * reset job is its only consumer. If a new activity type starts calling
 * incrementStreakQuery, extend this fragment to match.
 *
 * Expects the users row to be aliased `u` in the surrounding query.
 */
export const streakQualifyingActivitySql = (startMs: number, endMs: number) =>
  pgp.as.format(
    `(
      exists (
        select 1 from contract_bets b
        where b.user_id = u.id
          and b.created_time >= millis_to_ts($1)
          and b.created_time < millis_to_ts($2)
          -- streakEligible is the immutable insert-time marker of an
          -- executed bet (common/src/bet.ts), written explicitly true or
          -- false; later maker fills merge into data and can neither add
          -- nor remove it. Only rows predating the field are absent, and
          -- they fall back to amount != 0 — mutable, but the fallback can
          -- only be reached for a day whose bets were all inserted before
          -- the API deploy, so it ages out within a day of it.
          and coalesce((b.data->>'streakEligible')::boolean, b.amount != 0)
          and b.is_redemption is not true
      )
      or exists (
        select 1 from contract_perp_events e
        where e.user_id = u.id
          and e.ts >= millis_to_ts($1)
          and e.ts < millis_to_ts($2)
          and (
            e.event_type in ('open', 'add')
            -- Direct user closes write NO reason key (the coalesce falls
            -- through to qualifying) and flip auto-closes write 'flip';
            -- market settlement writes 'resolve-market' / 'resolve'. Keep
            -- this a negative filter: a positive reason allowlist would
            -- silently stop counting every direct close. Liquidation, ADL
            -- and funding are separate event types entirely.
            or (e.event_type = 'close'
              and coalesce(e.data->>'reason', '')
                not in ('resolve-market', 'resolve'))
          )
      )
    )`,
    [startMs, endMs]
  )

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
