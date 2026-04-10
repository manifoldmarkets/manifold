// IP geolocation service using ip-api.com (Pro)
import { log } from 'shared/monitoring/log'
import {
  checkSweepstakesGeofence,
  GeofenceCheckResult,
  GeoLocationResult,
} from 'common/sweepstakes-geofencing'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, { result: GeoLocationResult; timestamp: number }>()

/**
 * Fetch geolocation data for an IP address from ip-api.com Pro.
 * Results are cached for 5 minutes.
 */
export async function getGeoLocation(ip: string): Promise<GeoLocationResult> {
  // Check cache first
  const cached = cache.get(ip)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result
  }

  const apiKey = process.env.IP_API_PRO_KEY
  if (!apiKey) {
    log.error('Missing IP_API_PRO_KEY environment variable')
    // Allow by default if API key not configured
    return { status: 'success' }
  }

  try {
    const fields = 'status,message,countryCode,region'
    const url = `https://pro.ip-api.com/json/${ip}?key=${apiKey}&fields=${fields}`

    const response = await fetch(url)
    const result: GeoLocationResult = await response.json()

    if (result.status === 'fail') {
      log.warn(`ip-api lookup failed for ${ip}: ${result.message}`)
    }

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
