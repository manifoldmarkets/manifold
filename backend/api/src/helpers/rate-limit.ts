import { APIError, APIHandler, AuthedUser } from 'api/helpers/endpoint'
import { APIPath, APISchema, ValidatedAPIParams } from 'common/api/schema'
import { HOUR_MS } from 'common/util/time'
import { Request } from 'express'
import { getIp } from 'shared/analytics'
import { log } from 'shared/utils'
import { createSupabaseDirectClient, SupabaseDirectClient } from 'shared/supabase/init'
import { UserBan } from 'common/user'
import { convertUser } from 'common/supabase/users'
import {
  isUserBanned,
  getUserBanMessage,
  getBanTypesForAction,
} from 'common/ban-utils'

type RateLimitOptions = {
  maxCalls?: number // Maximum number of calls allowed in the time window
  windowMs?: number // Time window in milliseconds (default: 1 hour)
}

// Store rate limit data with timestamps
type RateLimitData = {
  count: number
  timestamps: number[]
}

export const rateLimitByUser = <N extends APIPath>(
  f: APIHandler<N>,
  options: RateLimitOptions = {}
) => {
  const { maxCalls = 25, windowMs = HOUR_MS } = options

  // Track rate limits by user ID and endpoint
  const rateLimits = new Map<string, Map<N, RateLimitData>>()

  return async (
    props: ValidatedAPIParams<N>,
    auth: APISchema<N> extends { authed: true }
      ? AuthedUser
      : AuthedUser | undefined,
    req: Request
  ) => {
    if (!auth) {
      log.error('Using rate limit by user without authentication')
      return f(props, auth, req)
    }
    const userId = auth.uid
    const endpoint = req.path as N

    if (!rateLimits.has(userId)) {
      rateLimits.set(userId, new Map())
    }
    const userLimits = rateLimits.get(userId)!

    if (!userLimits.has(endpoint)) {
      userLimits.set(endpoint, { count: 0, timestamps: [] })
    }
    const limitData = userLimits.get(endpoint)!

    const now = Date.now()

    limitData.timestamps = limitData.timestamps.filter(
      (time) => now - time < windowMs
    )

    if (limitData.timestamps.length >= maxCalls) {
      const oldestCall = limitData.timestamps[0]
      const timeToWait = Math.ceil((oldestCall + windowMs - now) / 1000)
      throw new APIError(
        429,
        `Rate limit exceeded. Please wait ${timeToWait} seconds before trying again.`
      )
    }

    limitData.timestamps.push(now)
    limitData.count++

    return f(props, auth, req)
  }
}

export const rateLimitByIp = <N extends APIPath>(
  f: APIHandler<N>,
  options: RateLimitOptions = {}
) => {
  const { maxCalls = 25, windowMs = HOUR_MS } = options

  // Track rate limits by IP address and endpoint
  const rateLimits = new Map<string, Map<N, RateLimitData>>()

  return async (
    props: ValidatedAPIParams<N>,
    auth: APISchema<N> extends { authed: true }
      ? AuthedUser
      : AuthedUser | undefined,
    req: Request
  ) => {
    const ip = getIp(req) ?? 'unknown'
    if (!ip) {
      log.error('Using rate limit by IP without IP address')
      return f(props, auth, req)
    }
    const endpoint = req.path as N

    if (!rateLimits.has(ip)) {
      rateLimits.set(ip, new Map())
    }
    const ipLimits = rateLimits.get(ip)!

    if (!ipLimits.has(endpoint)) {
      ipLimits.set(endpoint, { count: 0, timestamps: [] })
    }
    const limitData = ipLimits.get(endpoint)!

    const now = Date.now()

    limitData.timestamps = limitData.timestamps.filter(
      (time) => now - time < windowMs
    )

    if (limitData.timestamps.length >= maxCalls) {
      const oldestCall = limitData.timestamps[0]
      const timeToWait = Math.ceil((oldestCall + windowMs - now) / 1000)
      throw new APIError(
        429,
        `Rate limit exceeded. Please wait ${timeToWait} seconds before trying again.`
      )
    }

    limitData.timestamps.push(now)
    limitData.count++

    return f(props, auth, req)
  }
}

// Get active bans for a user from the database
// Accepts optional pg client for use within transactions
export async function getActiveUserBans(
  userId: string,
  pg?: SupabaseDirectClient
): Promise<UserBan[]> {
  const client = pg ?? createSupabaseDirectClient()
  return client.manyOrNone<UserBan>(
    `SELECT * FROM user_bans
     WHERE user_id = $1
       AND ended_at IS NULL
       AND (end_time IS NULL OR end_time > now())`,
    [userId]
  )
}

export const onlyUnbannedUsers = <N extends APIPath>(f: APIHandler<N>) => {
  return async (props: any, auth: any, req: any) => {
    const pg = createSupabaseDirectClient()
    const results = await pg.multi(
      `select * from users where id = $1;
       select * from user_bans where user_id = $1 and ended_at is null and (end_time is null or end_time > now());`,
      [auth.uid]
    )
    const user = results[0][0] ? convertUser(results[0][0]) : null
    const activeBans = results[1] as UserBan[]

    if (!user) {
      throw new APIError(404, 'User not found')
    }
    if (user.userDeleted) {
      throw new APIError(403, 'Your account has been deleted')
    }

    if (activeBans.length > 0) {
      throw new APIError(403, 'You are banned from posting')
    }

    return f(props, auth, req)
  }
}

// Map action names to human-readable descriptions for error messages
const getActionDisplayName = (action: string): string => {
  const actionNames: Record<string, string> = {
    comment: 'commenting',
    post: 'posting',
    message: 'messaging',
    createMarket: 'creating markets',
    updateMarket: 'editing markets',
    resolveMarket: 'resolving markets',
    editAnswer: 'editing answers',
    createAnswer: 'creating answers',
    hideComment: 'hiding comments',
    trade: 'trading',
    bet: 'betting',
    managram: 'sending managrams',
    addLiquidity: 'adding liquidity',
    removeLiquidity: 'removing liquidity',
    boost: 'boosting markets',
    review: 'leaving reviews',
    addTopic: 'adding topics',
    pollVote: 'voting in polls',
  }
  return actionNames[action] || action
}

// New granular ban check - uses pg.multi for single roundtrip
export const onlyUsersWhoCanPerformAction = <N extends APIPath>(
  action: string,
  f: APIHandler<N>
) => {
  return async (props: any, auth: any, req: any) => {
    const pg = createSupabaseDirectClient()
    const results = await pg.multi(
      `select * from users where id = $1;
       select * from user_bans where user_id = $1 and ended_at is null and (end_time is null or end_time > now());`,
      [auth.uid]
    )
    const user = results[0][0] ? convertUser(results[0][0]) : null
    const activeBans = results[1] as UserBan[]

    if (!user) {
      throw new APIError(404, 'User not found')
    }
    if (user.userDeleted) {
      throw new APIError(403, 'Your account has been deleted')
    }

    // Check all relevant ban types for this action
    const banTypes = getBanTypesForAction(action)
    for (const banType of banTypes) {
      if (isUserBanned(activeBans, banType)) {
        const message = getUserBanMessage(activeBans, banType)
        const displayName = getActionDisplayName(action)
        const errorMsg = message
          ? `You are banned from ${displayName}. Reason: ${message}`
          : `You are banned from ${displayName}`
        throw new APIError(403, errorMsg)
      }
    }

    return f(props, auth, req)
  }
}
