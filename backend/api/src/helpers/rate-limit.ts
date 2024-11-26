import { APIError, APIHandler } from 'api/helpers/endpoint'
import { APIPath } from 'common/api/schema'

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
  const { maxCalls = 10, windowMs = 60 * 60 * 1000 } = options // Default: 10 calls per hour

  // Track rate limits by user ID and endpoint
  const rateLimits = new Map<string, Map<N, RateLimitData>>()

  return async (props: any, auth: any, req: any) => {
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
