// Postal-code requirements for Printful shipping. Most countries require a
// postal code in the recipient address, but a handful either don't have one
// (UAE, Hong Kong) or treat it as optional in practice (Ireland's Eircode,
// Vietnam's 6-digit codes). Printful accepts orders without zip for these.
//
// Add to this set if a user reports a country where Printful is rejecting
// orders specifically because of the zip requirement.
//
// Future: if merch operations grows, replace this hard-coded set with a
// scheduled sync from Printful's GET /countries endpoint (it exposes
// state_required + postal_code_required flags per country). Cache the
// result in a `printful_countries` table and read it from here. Until
// then, this list works because Printful's coverage changes maybe once
// every couple of years.
const POSTAL_CODE_OPTIONAL_COUNTRIES = new Set<string>([
  'HK', // Hong Kong — no postal codes
  'AE', // United Arab Emirates — no postal codes
  'IE', // Ireland — Eircode exists but adoption/enforcement is patchy
  'VN', // Vietnam — codes exist but rarely required by carriers
])

// True when the given ISO-2 country code requires a postal code in the
// shipping address. Used to gate both the client form and the server-side
// purchase/rates handlers.
export const requiresPostalCode = (countryCode: string): boolean =>
  !POSTAL_CODE_OPTIONAL_COUNTRIES.has(countryCode.toUpperCase())
