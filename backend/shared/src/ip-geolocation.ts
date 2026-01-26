// IP geolocation service using ip-api.com
import { log } from 'shared/monitoring/log'
import {
  checkSweepstakesGeofence,
  GeofenceCheckResult,
  GeoLocationResult,
} from 'common/sweepstakes-geofencing'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, { result: GeoLocationResult; timestamp: number }>()

let rateLimitRemaining = 45
let rateLimitResetTime = 0

/**
 * Fetch geolocation data for an IP address from ip-api.com.
 * Results are cached for 5 minutes.
 */
export async function getGeoLocation(ip: string): Promise<GeoLocationResult> {
  // Check cache first
  const cached = cache.get(ip)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }

  // If rate limited, allow by default
  if (rateLimitRemaining <= 0 && Date.now() < rateLimitResetTime) {
    log.warn('ip-api rate limit reached, allowing by default')
    return { status: 'success' }
  }

  try {
    const fields = 'status,message,countryCode,region'
    const url = `http://ip-api.com/json/${ip}?fields=${fields}`

    const response = await fetch(url)

    // Update rate limit tracking from headers
    const remaining = response.headers.get('X-Rl')
    const ttl = response.headers.get('X-Ttl')
    if (remaining !== null) {
      rateLimitRemaining = parseInt(remaining)
      if (rateLimitRemaining < 10) {
        log.warn(`ip-api rate limit low: ${rateLimitRemaining} remaining`)
      }
    }
    if (ttl !== null) {
      rateLimitResetTime = Date.now() + parseInt(ttl) * 1000
    }

    const result: GeoLocationResult = await response.json()
    cache.set(ip, { result, timestamp: Date.now() })
    return result
  } catch (error) {
    log.error('ip-api request failed', { error })
    // Allow by default on error
    return { status: 'success' }
  }
}

/**
 * High-level function for SSR/API to check sweepstakes location.
 * Handles geolocation lookup and geofence checking in one call.
 */
export async function isSweepstakesLocationAllowed(
  ip: string
): Promise<GeofenceCheckResult> {
  const geo = await getGeoLocation(ip)
  return checkSweepstakesGeofence(geo)
}
