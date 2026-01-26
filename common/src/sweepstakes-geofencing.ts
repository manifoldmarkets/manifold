// Sweepstakes geofencing configuration and logic

// Restricted countries (ISO 3166-1 alpha-2)
export const RESTRICTED_COUNTRIES: string[] = [
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'RU', // Russia
  'BY', // Belarus
]

// Restricted US states (ip-api region codes)
export const RESTRICTED_US_STATES: string[] = [
  'WA', // Washington
  'NY', // New York
  'NV', // Nevada
  'MD', // Maryland
  'MA', // Massachusetts
  'LA', // Louisiana
]

// Result from ip-api.com geolocation lookup
export interface GeoLocationResult {
  status: 'success' | 'fail'
  message?: string
  countryCode?: string
  region?: string
}

// Result of geofence check
export interface GeofenceCheckResult {
  allowed: boolean
  reason?: 'restricted_country' | 'restricted_state'
  countryCode?: string
  region?: string
}

/**
 * Check if a geolocation result is allowed for sweepstakes participation.
 */
export function checkSweepstakesGeofence(
  geo: GeoLocationResult
): GeofenceCheckResult {
  // If lookup failed, allow by default
  if (geo.status !== 'success') {
    return { allowed: true }
  }

  // Check restricted countries
  if (geo.countryCode && RESTRICTED_COUNTRIES.includes(geo.countryCode)) {
    return {
      allowed: false,
      reason: 'restricted_country',
      countryCode: geo.countryCode,
      region: geo.region,
    }
  }

  // Check restricted US states
  if (
    geo.countryCode === 'US' &&
    geo.region &&
    RESTRICTED_US_STATES.includes(geo.region)
  ) {
    return {
      allowed: false,
      reason: 'restricted_state',
      countryCode: geo.countryCode,
      region: geo.region,
    }
  }

  return {
    allowed: true,
    countryCode: geo.countryCode,
    region: geo.region,
  }
}
