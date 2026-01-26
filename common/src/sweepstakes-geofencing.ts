// Sweepstakes geofencing configuration and logic

// Restricted countries (ISO 3166-1 alpha-2)
export const RESTRICTED_COUNTRIES: string[] = [
  'AU', // Australia
  'BY', // Belarus
  'BI', // Burundi
  'CF', // Central African Republic
  'CD', // Democratic Republic of the Congo
  'CU', // Cuba
  'DE', // Germany
  'ET', // Ethiopia
  'IR', // Iran
  'IQ', // Iraq
  'KP', // North Korea
  'LB', // Lebanon
  'LY', // Libya
  'MM', // Myanmar
  'NI', // Nicaragua
  'NL', // Netherlands
  'RU', // Russia
  'SO', // Somalia
  'SS', // South Sudan
  'SD', // Sudan
  'SY', // Syria
  'VE', // Venezuela
  'YE', // Yemen
  'ZW', // Zimbabwe
]

// Restricted US states/territories (ip-api region codes)
export const RESTRICTED_US_STATES: string[] = [
  'NY', // New York
  'NV', // Nevada
  'DE', // Delaware
  'ID', // Idaho
  'MI', // Michigan
  'WA', // Washington
  'DC', // Washington D.C.
]

// Restricted Canadian provinces (ip-api region codes)
export const RESTRICTED_CA_PROVINCES: string[] = [
  'ON', // Ontario
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

  // Check restricted Canadian provinces
  if (
    geo.countryCode === 'CA' &&
    geo.region &&
    RESTRICTED_CA_PROVINCES.includes(geo.region)
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
