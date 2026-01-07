import { APIError, APIHandler, AuthedUser } from 'api/helpers/endpoint'
import { APIPath, APISchema, ValidatedAPIParams } from 'common/api/schema'
import { HOUR_MS } from 'common/util/time'
import { Request } from 'express'
import { getIp } from 'shared/analytics'
import { getUser, log } from 'shared/utils'

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

export const onlyUnbannedUsers = <N extends APIPath>(f: APIHandler<N>) => {
  return async (props: any, auth: any, req: any) => {
    const user = await getUser(auth.uid)
    if (!user) {
      throw new APIError(404, 'User not found')
    }
    if (user.isBannedFromPosting) {
      throw new APIError(403, 'You are banned from posting')
    }
    if (user.userDeleted) {
      throw new APIError(403, 'Your account has been deleted')
    }

    return f(props, auth, req)
  }
}
